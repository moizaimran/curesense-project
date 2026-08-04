# ==============================================================================
# api/app.py — Stateless Flask API for the CureSense AI microservice
#
# All state (conversation history, turn counter) lives in Express/MongoDB.
# Every request is fully self-contained using only what's passed in the body.
#
# Endpoints
# ─────────
# POST /interview/turn
#   Body:  { turn_number, history, patient_text }
#       OR { turn_number, history, patient_audio_url }
#   Returns: { status, message, correctedPatientText }
#
# POST /pipeline/finalize
#   Body:  { full_transcript_text }
#   Returns: { verifiedEntities, rankedDiseases, ragQuery, diagnosticQuery,
#              retrievedSources, medicationInfo, doctorReport, patientSummary }
#
# Launch
# ──────
# Call launch(port, ngrok_token) from the notebook after loading all secrets.
# Flask runs in a daemon thread; Ngrok exposes it and returns the public URL.
# ==============================================================================
import os
import tempfile
import threading

import requests as http
from flask import Flask, request, jsonify

from glinker import config
from glinker.interview.session  import run_interview_turn
from glinker.interview.prompts  import INTERVIEW_PROMPT, INTERVIEW_FEWSHOT
from glinker.diagnosis.finalize        import run_gliner, finalize_report
from glinker.rag.retrieval             import retrieve_context, get_medication_info
from glinker.disease.ranker            import rank_diseases
from glinker.diagnosis.combined_report import generate_combined_report

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

@app.route("/interview/turn", methods=["POST"])
def interview_turn():
    data = request.get_json(force=True)

    turn_number = data.get("turn_number")
    live_history = data.get("history", [])

    if turn_number is None:
        return jsonify({"error": "turn_number is required"}), 400

    # ── Resolve patient text (text or audio) ──────────────────────────────────
    patient_text = data.get("patient_text", "").strip()

    if patient_text:
        raw_patient_text = patient_text          # text turns: raw == what was sent in
    else:
        audio_url = data.get("patient_audio_url", "").strip()
        if not audio_url:
            return jsonify({"error": "patient_text or patient_audio_url is required"}), 400
        try:
            patient_text = _transcribe_audio(audio_url)
            raw_patient_text = patient_text      # voice turns: raw == Whisper output, pre-LLM
        except Exception as e:
            return jsonify({"error": f"Audio transcription failed: {e}"}), 502

    # ── Safety cap — skip LLM call entirely, return clean closing message ──────
    if turn_number >= config.LLM_CONFIG["interview_max_turns"]:
        return jsonify({
            "status"              : "complete",
            "message"             : (
                "Thanks for sharing all of this — I have what I need for now. "
                "The clinician will review your responses shortly."
            ),
            "rawPatientText"      : raw_patient_text,
            "correctedPatientText": patient_text,
            "questionType"        : "text",
            "options"             : [],
        })

    # ── Normal turn — run interview logic with history supplied by Express ─────
    full_history = _build_full_history(live_history)
    result = run_interview_turn(full_history, patient_text)
    result["rawPatientText"] = raw_patient_text
    return jsonify(result)


@app.route("/pipeline/finalize", methods=["POST"])
def pipeline_finalize():
    data = request.get_json(force=True)
    transcript_text = data.get("full_transcript_text", "").strip()

    if not transcript_text:
        return jsonify({"error": "full_transcript_text is required"}), 400

    # ── 1. GLiNER ─────────────────────────────────────────────────────────────
    gliner_entities = run_gliner(transcript_text)

    # ── 2. Finalize — entity verification + ragQuery + diagnosticQuery ─────────
    report           = finalize_report(transcript_text, gliner_entities)
    rag_query        = report.get("ragQuery", "")
    diagnostic_query = report.get("diagnosticQuery", "")

    # ── 3. RAG retrieval (non-critical — degrades gracefully if index missing) ─
    retrieved_chunks = []
    if rag_query:
        try:
            retrieved_chunks = retrieve_context(rag_query)
            n = len(retrieved_chunks)
            print(f"[RAG] {n} chunk(s) retrieved." if n else "[RAG] No chunks above threshold.")
        except Exception as e:
            print(f"[RAG] retrieve_context failed: {e} — continuing without retrieval.")

    retrieval_status = _retrieval_status(retrieved_chunks)

    # ── 4. Disease ranking — uses verified entities + LLM-crafted diagnosticQuery
    ranked_diseases = []
    try:
        ranked_diseases = rank_diseases(report["entities"], diagnostic_query)
        print(f"[Ranker] {len(ranked_diseases)} candidate(s) returned.")
    except Exception as e:
        print(f"[Ranker] rank_diseases failed: {e} — continuing without ranking.")

    # ── 5. openFDA — live lookup per medication (non-critical) ────────────────
    med_names = [
        e["keyword"] for e in report["entities"]
        if e.get("category") == "medication"
    ]
    medication_info = {}
    if med_names:
        try:
            medication_info = get_medication_info(med_names)
        except Exception as e:
            print(f"[openFDA] get_medication_info failed: {e} — continuing without drug data.")

    # ── 6. Combined report — one LLM call for doctor + patient + diagnoses ────
    combined = generate_combined_report(
        transcript_text, report["entities"], retrieved_chunks, medication_info,
        ranked_diseases, retrieval_status,
    )

    doctor_report         = combined.get("doctorReport", {})
    patient_summary       = combined.get("patientSummary", {})
    interpreted_diagnoses = combined.get("interpretedDiagnoses", [])

    doctor_report["retrievalStatus"] = retrieval_status

    return jsonify({
        "verifiedEntities"    : report["entities"],
        "rankedDiseases"      : ranked_diseases,
        "ragQuery"            : rag_query,
        "diagnosticQuery"     : diagnostic_query,
        "retrievedSources"    : retrieved_chunks,
        "medicationInfo"      : medication_info,
        "doctorReport"        : doctor_report,
        "patientSummary"      : patient_summary,
        "interpretedDiagnoses": interpreted_diagnoses,
    })


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
