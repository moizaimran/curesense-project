# ==============================================================================
# api/app.py — Stateless Flask API for the CureSense AI microservice
#
# All state (conversation history, turn counter) lives in Express/MongoDB.
# Every request is fully self-contained using only what's passed in the body.
#
# Endpoints
# ─────────
# POST /interview/turn
#   Body:  { turn_number, history, patient_text, request_session_name? }
#          (voice answers are transcribed first via POST /audio/transcribe)
#   Returns: { status, message, correctedPatientText, questionType, options,
#              sessionName }   — sessionName is "" unless request_session_name
#
# POST /pipeline/finalize
#   Body:  { full_transcript_text, profile_medications?, profile_allergies?,
#            profile_conditions?, specialties? }
#   Returns: { verifiedEntities, rankedDiseases, ragQuery, diagnosticQuery,
#              retrievedSources, medicationInfo,
#              emergencyWarning, interpretedDiagnoses,
#              doctorReport, patientSummary }
#
# Launch
# ──────
# Call launch(port, ngrok_token) from the notebook after loading all secrets.
# Flask runs in a daemon thread; Ngrok exposes it and returns the public URL.
# ==============================================================================
import os
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests as http
from flask import Flask, request, jsonify

from glinker import config
from glinker.interview.session              import run_interview_turn
from glinker.interview.prompts              import INTERVIEW_PROMPT, INTERVIEW_FEWSHOT, SESSION_NAME_NOTE
from glinker.diagnosis.finalize             import run_gliner, finalize_report
from glinker.rag.retrieval                  import retrieve_context, get_medication_info
from glinker.disease.disease_retrieval      import retrieve_diseases
from glinker.diagnosis.assessment           import generate_diagnosis_assessment
from glinker.diagnosis.doctor_report        import generate_doctor_report
from glinker.diagnosis.patient_summary      import generate_patient_summary
from glinker.images.pdf_analysis            import analyze_pdf
from glinker.images.correlation             import correlate_image_with_report

app = Flask(__name__)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _transcribe_audio(audio_url: str) -> str:
    """Download audio from URL and transcribe/translate to English via Whisper."""
    resp = http.get(audio_url, timeout=30)
    resp.raise_for_status()

    suffix = os.path.splitext(audio_url.split("?")[0])[-1] or ".mp3"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(resp.content)
        tmp_path = f.name

    try:
        result = config.whisper_model.transcribe(tmp_path, task="translate")
        return result["text"].strip()
    finally:
        os.unlink(tmp_path)


def _retrieval_status(chunks: list[dict]) -> str:
    """Compute retrieval status from actual chunk scores — never let the LLM guess this."""
    if not chunks:
        return "no_relevant_content"
    return "grounded" if max(c["score"] for c in chunks) >= 0.65 else "partial"


def _build_full_history(live_history: list[dict]) -> list[dict]:
    """
    Reassemble the full message list the LLM expects on every call:
      [system prompt] + INTERVIEW_FEWSHOT + live turns from Express.

    Express tracks only the live user/assistant turns — not the static
    system/few-shot parts — so Flask prepends them on each request.
    """
    return (
        [{"role": "system", "content": INTERVIEW_PROMPT}]
        + INTERVIEW_FEWSHOT
        + live_history
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/audio/transcribe", methods=["POST"])
def audio_transcribe():
    """Transcribe a Cloudinary audio URL with Whisper — no interview logic."""
    data = request.get_json(force=True)
    audio_url = data.get("audio_url", "").strip()
    if not audio_url:
        return jsonify({"error": "audio_url is required"}), 400
    try:
        transcribed = _transcribe_audio(audio_url)
        return jsonify({"transcribed_text": transcribed})
    except Exception as e:
        print(f"[audio_transcribe] ERROR: {e}")
        return jsonify({"error": f"Transcription failed: {e}"}), 502


@app.route("/interview/turn", methods=["POST"])
def interview_turn():
    data = request.get_json(force=True)

    turn_number = data.get("turn_number")
    live_history = data.get("history", [])

    if turn_number is None:
        return jsonify({"error": "turn_number is required"}), 400

    # Voice answers are transcribed beforehand via /audio/transcribe, so every turn is text
    patient_text = data.get("patient_text", "").strip()
    if not patient_text:
        return jsonify({"error": "patient_text is required"}), 400

    # ── Safety cap — skip LLM call entirely, return clean closing message ──────
    if turn_number >= config.LLM_CONFIG["interview_max_turns"]:
        return jsonify({
            "status"              : "complete",
            "message"             : (
                "Thanks for sharing all of this — I have what I need for now. "
                "The clinician will review your responses shortly."
            ),
            "correctedPatientText": patient_text,
            "questionType"        : "text",
            "options"             : [],
            "sessionName"         : "",
        })

    # ── Normal turn — run interview logic with history supplied by Express ─────
    # Express sets request_session_name while the session still has no title
    # (first turn, or second if the first produced none) — no separate LLM call.
    wants_name   = bool(data.get("request_session_name"))
    full_history = _build_full_history(live_history)
    if wants_name:
        full_history.append({"role": "system", "content": SESSION_NAME_NOTE})
    result = run_interview_turn(full_history, patient_text)
    if not wants_name:
        result["sessionName"] = ""
    return jsonify(result)


@app.route("/pipeline/finalize", methods=["POST"])
def pipeline_finalize():
    data = request.get_json(force=True)
    transcript_text    = data.get("full_transcript_text", "").strip()
    profile_medications = data.get("profile_medications", [])
    specialties         = data.get("specialties", [])   # allowed referral specialties (backend's list)
    # Allergies and conditions saved in the patient's profile — treated like reported history
    patient_profile = {
        "knownAllergies"   : data.get("profile_allergies", []),
        "medicalConditions": data.get("profile_conditions", []),
    }

    if not transcript_text:
        return jsonify({"error": "full_transcript_text is required"}), 400

    # ── 1. GLiNER ─────────────────────────────────────────────────────────────
    gliner_entities = run_gliner(transcript_text)

    # ── 2. Finalize — entity verification + ragQuery + diagnosticQuery ─────────
    report           = finalize_report(transcript_text, gliner_entities, profile_medications)
    rag_query        = report.get("ragQuery", "")
    diagnostic_query = report.get("diagnosticQuery", "")

    # ── 3. RAG retrieval — clinician + patient corpus run concurrently ─────────
    # Both are in-process FAISS searches on separate index objects — no shared
    # state, so running them in parallel is safe and cuts wall-clock time.
    retrieved_chunks = []
    with ThreadPoolExecutor(max_workers=1) as pool:
        if rag_query:
            fut_clinician = pool.submit(retrieve_context, rag_query)
            try:
                retrieved_chunks = fut_clinician.result()
                n = len(retrieved_chunks)
                print(f"[RAG-clinician] {n} chunk(s)." if n else "[RAG-clinician] No chunks above threshold.")
            except Exception as e:
                print(f"[RAG-clinician] retrieve failed: {e} — continuing without retrieval.")

    # ── 4. Disease retrieval — semantic search against HPO + ICD-10 index ─────
    ranked_diseases = []
    try:
        ranked_diseases = retrieve_diseases(report["entities"], diagnostic_query)
        print(f"[DiseaseRAG] {len(ranked_diseases)} candidate(s) returned.")
    except Exception as e:
        print(f"[DiseaseRAG] retrieve_diseases failed: {e} — continuing without disease candidates.")

    # ── 5. openFDA — official label per medication (non-critical) ─────────────
    # Interview medications first, then the saved profile list; finalize_report mapped
    # each name to its US generic so brand/local names (Panadol, Augmentin) still match.
    med_names = [
        e["keyword"] for e in report["entities"]
        if e.get("category") == "medication"
    ] + list(profile_medications)
    generic_names = {m["name"]: m["genericName"] for m in report.get("medications", [])}
    medication_info = {}
    if med_names:
        try:
            medication_info = get_medication_info(med_names, generic_names)
        except Exception as e:
            print(f"[openFDA] get_medication_info failed: {e} — continuing without drug data.")

    # ── 6. Call 1 — Diagnosis Assessment (must complete before Calls 2 & 3) ───
    assessment = generate_diagnosis_assessment(
        verified_entities = report["entities"],
        ranked_diseases   = ranked_diseases,
        medication_info   = medication_info,
        retrieved_chunks  = retrieved_chunks,
        transcript_text   = transcript_text,
        patient_profile   = patient_profile,
    )

    # ── 7. Calls 2 & 3 — Doctor Report + Patient Summary (concurrent) ─────────
    # Both depend on assessment but are fully independent of each other.
    # These are I/O-bound LLM API calls — ThreadPoolExecutor genuinely
    # parallelises the network wait time despite Python's GIL.
    doctor_report   = {}
    patient_summary = {}
    with ThreadPoolExecutor(max_workers=2) as pool:
        fut_doctor  = pool.submit(
            generate_doctor_report,
            assessment, report["entities"], retrieved_chunks, transcript_text, patient_profile,
        )
        fut_patient = pool.submit(
            generate_patient_summary,
            assessment, report["entities"], retrieved_chunks,
            medication_info, transcript_text, specialties, patient_profile,
        )
        try:
            doctor_report = fut_doctor.result()
        except Exception as e:
            print(f"[Call2] generate_doctor_report failed: {e}")
        try:
            patient_summary = fut_patient.result()
        except Exception as e:
            print(f"[Call3] generate_patient_summary failed: {e}")

    # ── 8. Assemble final response ─────────────────────────────────────────────
    # emergencyWarning and interpretedDiagnoses are returned once, at top level;
    # both doctor and patient views are built from them by the backend.

    return jsonify({
        "verifiedEntities"    : report["entities"],
        "rankedDiseases"      : ranked_diseases,
        "ragQuery"            : rag_query,
        "diagnosticQuery"     : diagnostic_query,
        "retrievedSources"    : retrieved_chunks,
        "medicationInfo"      : medication_info,
        "emergencyWarning"    : assessment.get("emergencyWarning",
                                               {"triggered": False, "reason": "", "message": ""}),
        "interpretedDiagnoses": assessment.get("interpretedDiagnoses", []),
        "doctorReport"        : doctor_report,
        "patientSummary"      : patient_summary,
    })


# ── Images: PDF analysis ─────────────────────────────────────────────────────

@app.route("/images/analyze-pdf", methods=["POST"])
def images_analyze_pdf():
    data       = request.get_json(force=True)
    pdf_base64 = data.get("pdf_base64", "").strip()
    filename   = data.get("filename", "document.pdf")

    if not pdf_base64:
        return jsonify({"error": "pdf_base64 is required"}), 400

    try:
        result = analyze_pdf(pdf_base64, filename)
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        return jsonify({"error": f"Analysis failed: {exc}"}), 502


# ── Images: clinical correlation ─────────────────────────────────────────────

@app.route("/images/correlate-with-report", methods=["POST"])
def images_correlate_with_report():
    """
    Correlate a MedGemma / PDF image analysis with the patient's interview report.

    Body:
      {
        "image_analysis":   { ... },   # analysis_result from ImageUpload
        "clinical_summary": {          # compact subset of the Report
          "disease_ranking":       [...],
          "complaint_summary":     "...",
          "rag_summary":           "...",
          "interpreted_diagnoses": [...]
        }
      }

    Returns:
      { "correlation": "<clinical correlation text>" }
    """
    data             = request.get_json(force=True)
    image_analysis   = data.get("image_analysis")
    clinical_summary = data.get("clinical_summary")

    if not image_analysis:
        return jsonify({"error": "image_analysis is required"}), 400

    try:
        result = correlate_image_with_report(image_analysis, clinical_summary or {})
        return jsonify(result)
    except Exception as exc:
        print(f"[images_correlate_with_report] ERROR: {exc}")
        return jsonify({"error": f"Correlation failed: {exc}"}), 502


# ── Launch (called from the notebook after secrets are loaded) ────────────────

def launch(port: int = 5001, ngrok_token: str | None = None) -> str:
    """
    Start Flask in a background daemon thread, then expose it via Ngrok.
    Returns the public HTTPS URL.

    Usage in main.ipynb:
        from api.app import launch
        API_URL = launch(port=5001, ngrok_token=userdata.get("NGROK_AUTH_TOKEN"))
    """
    from pyngrok import ngrok

    if ngrok_token:
        ngrok.set_auth_token(ngrok_token)

    t = threading.Thread(
        target=lambda: app.run(port=port, debug=False, use_reloader=False),
        daemon=True,
    )
    t.start()

    public_url = ngrok.connect(port).public_url
    print(f"[API] Live at {public_url}")
    return public_url
