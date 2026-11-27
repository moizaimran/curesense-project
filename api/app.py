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
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests as http
from flask import Flask, request, jsonify

from glinker import config
from glinker.utils                          import call_llm
from glinker.interview.session              import run_interview_turn
from glinker.interview.prompts              import INTERVIEW_PROMPT, INTERVIEW_FEWSHOT, SESSION_NAME_NOTE
from glinker.diagnosis.prompts              import (
    CHECKPOINT_PROMPT, CHECKPOINT_SCHEMA,
    build_differential_prompt, build_closing_prompt,
)
from glinker.diagnosis.finalize             import run_gliner, finalize_report
from glinker.rag.retrieval                  import retrieve_context, get_medication_info
from glinker.diagnosis.assessment           import generate_diagnosis_assessment
from glinker.diagnosis.doctor_report        import generate_doctor_report
from glinker.diagnosis.patient_summary      import generate_patient_summary
from glinker.images.pdf_analysis            import analyze_pdf
from glinker.images.correlation             import correlate_image_with_report
from glinker.images.scan_analysis          import analyze_xray, analyze_ct_mri

app = Flask(__name__)

# ── Helpers ───────────────────────────────────────────────────────────────────



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

@app.route("/interview/turn", methods=["POST"])
def interview_turn():
    data = request.get_json(force=True)

    turn_number = data.get("turn_number")
    live_history = data.get("history", [])

    if turn_number is None:
        return jsonify({"error": "turn_number is required"}), 400

    # Voice answers are transcribed beforehand via /audio/transcribe, so every turn is text
    patient_text          = data.get("patient_text", "").strip()
    differential_diseases = data.get("differential_diseases", [])

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

    # ── Minimum turn guard — prevent premature status=complete ────────────────
    # The LLM (especially with low reasoning effort) can shortcut the STOP RULE
    # on early turns when the patient gives a brief or structured answer (e.g. a
    # body map selection). Block complete before turn 5 at the prompt level.
    MIN_TURNS_BEFORE_COMPLETE = 8
    if turn_number < MIN_TURNS_BEFORE_COMPLETE:
        full_history.append({
            "role"   : "system",
            "content": (
                f"HARD RULE: You MUST NOT set status=complete on turn {turn_number}. "
                f"At least {MIN_TURNS_BEFORE_COMPLETE} patient answers are required before "
                "the STOP RULE check is permitted. Set status=continue and ask the next "
                "uncovered SOCRATES dimension."
            ),
        })

    # ── Phase injection — append differential/closing prompt when diseases known ─
    # Turns 5–8: differential phase — ask questions to distinguish top diseases
    # Turns 9–15: closing phase — confirm leading diagnosis and wrap up
    if differential_diseases:
        if turn_number <= 8:
            full_history.append({
                "role"   : "system",
                "content": build_differential_prompt(differential_diseases),
            })
        else:
            full_history.append({
                "role"   : "system",
                "content": build_closing_prompt(differential_diseases),
            })

    result = run_interview_turn(full_history, patient_text)
    if not wants_name:
        result["sessionName"] = ""
    return jsonify(result)


@app.route("/interview/checkpoint", methods=["POST"])
def interview_checkpoint():
    """
    Intermediate disease ranking call — called by Express after turns 4 and 8.

    Takes the conversation history so far and returns the top likely diseases
    based ONLY on what the patient has explicitly reported. The result is stored
    in the session and injected as a system prompt in subsequent interview turns
    to guide differential questioning.

    Body:  { "history": [{role, content}, ...] }
    Returns: { "diseases": [{name, icdCode, confidence}, ...] }
    """
    data    = request.get_json(force=True)
    history = data.get("history", [])

    if not history:
        return jsonify({"error": "history is required"}), 400

    messages = [{"role": "system", "content": CHECKPOINT_PROMPT}] + history
    fallback = {"diseases": []}
    result   = call_llm(messages, CHECKPOINT_SCHEMA, "checkpoint_max_tokens", fallback, "interview_checkpoint")
    print(f"[checkpoint] {len(result.get('diseases', []))} disease(s) identified")
    return jsonify(result)


@app.route("/pipeline/finalize", methods=["POST"])
def pipeline_finalize():
    data = request.get_json(force=True)
    transcript_text    = data.get("full_transcript_text", "").strip()
    profile_medications = data.get("profile_medications", [])
    specialties         = data.get("specialties", [])   # allowed referral specialties (backend's list)
    # Allergies and conditions saved in the patient's profile — treated like reported history
    patient_profile = {
        "knownAllergies"    : data.get("profile_allergies", []),
        "medicalConditions" : data.get("profile_conditions", []),
        "profileMedications": profile_medications,
    }

    interview_diseases  = data.get("interview_diseases", [])

    if not transcript_text:
        return jsonify({"error": "full_transcript_text is required"}), 400

    # ── 1. GLiNER ─────────────────────────────────────────────────────────────
    gliner_entities = run_gliner(transcript_text)

    # ── 2. Finalize — entity verification + ragQueries + diagnosticQuery ────────
    report           = finalize_report(transcript_text, gliner_entities, profile_medications)
    rag_queries      = report.get("ragQueries", [])
    rag_query        = rag_queries[0] if rag_queries else ""   # primary query for DB / response
    diagnostic_query = report.get("diagnosticQuery", "")

    # ── 3. RAG retrieval — multi-query hybrid search + MedCPT reranker ─────────
    retrieved_chunks = []
    with ThreadPoolExecutor(max_workers=1) as pool:
        if rag_queries and any(rag_queries):
            fut_clinician = pool.submit(retrieve_context, rag_queries)
            try:
                retrieved_chunks = fut_clinician.result()
                n = len(retrieved_chunks)
                print(f"[RAG] {n} chunk(s) returned." if n else "[RAG] No chunks above threshold.")
            except Exception as e:
                print(f"[RAG] retrieve failed: {e} — continuing without retrieval.")

    # ── 4. Disease ranking — LLM-only via interview checkpoint diseases ─────────
    # FAISS removed: checkpoint diseases (from /interview/checkpoint at T4 and T8)
    # are passed directly to generate_diagnosis_assessment() as interview_diseases.
    # The assessment LLM evaluates them against verified entities.
    ranked_diseases = []

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
        verified_entities  = report["entities"],
        ranked_diseases    = ranked_diseases,
        medication_info    = medication_info,
        retrieved_chunks   = retrieved_chunks,
        transcript_text    = transcript_text,
        patient_profile    = patient_profile,
        interview_diseases = interview_diseases,
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
        "ragQuery"            : rag_query,        # primary query — stored in DB
        "ragQueries"          : rag_queries,      # all 3 variants — for debugging
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


# ── Scan analysis: X-ray and CT/MRI via SageMaker MedGemma ──────────────────
# Backend sets MEDGEMMA_SERVICE_URL to this EC2 service URL.
# Preprocessing (DICOM, CT windowing, montage) runs here on EC2 CPU;
# only the final preprocessed image is sent to the SageMaker endpoint.

@app.route("/analyze/xray", methods=["POST"])
def route_analyze_xray():
    data         = request.get_json(force=True)
    image_base64 = data.get("image_base64", "").strip()
    if not image_base64:
        return jsonify({"error": "image_base64 is required"}), 400
    try:
        result = analyze_xray(image_base64)
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        print(f"[analyze/xray] ERROR: {exc}")
        return jsonify({"error": f"Analysis failed: {exc}"}), 502


@app.route("/analyze/ct-mri", methods=["POST"])
def route_analyze_ct_mri():
    data         = request.get_json(force=True)
    image_base64 = data.get("image_base64", "").strip()
    modality     = data.get("modality", "ct")
    if not image_base64:
        return jsonify({"error": "image_base64 is required"}), 400
    try:
        result = analyze_ct_mri(image_base64, modality)
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        print(f"[analyze/ct-mri] ERROR: {exc}")
        return jsonify({"error": f"Analysis failed: {exc}"}), 502


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
