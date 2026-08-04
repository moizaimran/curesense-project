# ==============================================================================
# glinker/diagnosis/combined_report.py
#
# Single LLM call that produces doctor report + patient summary +
# interpreted diagnoses in one structured output.
# Replaces the previous separate doctor_report.py + patient_summary.py calls.
# ==============================================================================
import json
from glinker import config
from glinker.utils import parse_json_response
from glinker.diagnosis.prompts import COMBINED_REPORT_PROMPT, COMBINED_REPORT_SCHEMA


def _fmt_chunks(retrieved_chunks: list[dict]) -> str:
    if not retrieved_chunks:
        return (
            "No relevant reference material was retrieved above the similarity threshold. "
            "Route from stated symptoms and entities alone."
        )
    parts = []
    for c in retrieved_chunks:
        label = f"Source: {c['source']}"
        if c.get("title"):
            label += f" | {c['title']}"
        label += f" | Score: {c['score']}"
        parts.append(f"[{label}]\n{c['text']}")
    return "\n\n".join(parts)


def _fmt_medications(medication_info: dict) -> str:
    if not medication_info:
        return "No medication label data provided."
    parts = []
    for drug, info in medication_info.items():
        sections_text = "\n".join(
            f"  [{sec.replace('_', ' ').title()}]: {text[:400]}"
            for sec, text in info.get("sections", {}).items()
        )
        parts.append(f"Drug: {drug} (Source: {info.get('source', 'openFDA')})\n{sections_text}")
    return "\n\n".join(parts)


def _fmt_ranked_diseases(ranked_diseases: list[dict]) -> str:
    if not ranked_diseases:
        return "No disease candidates available from the diagnostic module."
    lines = []
    for i, d in enumerate(ranked_diseases[:10], 1):
        lines.append(f"  {i}. {d.get('disease', 'Unknown')} — confidence {d.get('confidence', 0):.1f}/100")
    return "TF-IDF symptom-pattern candidates (normalized to 100):\n" + "\n".join(lines)


def generate_combined_report(
    transcript_text: str,
    verified_entities: list[dict],
    retrieved_chunks: list[dict],
    medication_info: dict,
    ranked_diseases: list[dict],
) -> dict:
    """
    Single LLM call producing:
      result["doctorReport"]        — clinical report for the clinician
      result["patientSummary"]      — plain-language summary for the patient
      result["interpretedDiagnoses"] — LLM-evaluated disease candidates
                                       (plausibility + clinicalReason + patientNote)

    The caller (app.py) splits these three keys and returns them separately.
    """
    payload = json.dumps({
        "transcript"          : transcript_text,
        "verifiedEntities"    : verified_entities,
        "retrievedChunks"     : _fmt_chunks(retrieved_chunks),
        "medicationInfo"      : _fmt_medications(medication_info),
        "diagnosticCandidates": _fmt_ranked_diseases(ranked_diseases),
    })

    fallback = {
        "doctorReport": {
            "interviewClinicalSummary"     : "Report generation failed.",
            "retrievalAndMedicationSummary": "",
            "recommendedSpecialty"         : "General Medicine",
            "specialtyReasoning"           : "Defaulted due to generation failure.",
            "guidelineConsiderations"      : [],
            "medicationFlags"              : [],
            "retrievalStatus"              : "no_relevant_content",
            "confidenceNote"               : "generate_combined_report call failed.",
        },
        "patientSummary": {
            "patientComplaintSummary": "We received your description of your symptoms.",
            "referralSpecialty"      : "General Medicine",
            "appointmentGuidance"    : [],
            "medicationNotes"        : [],
        },
        "interpretedDiagnoses": [],
    }

    try:
        response = config.openai_client.chat.completions.create(
            model=config.LLM_CONFIG["model"],
            max_completion_tokens=config.LLM_CONFIG["diagnose_max_tokens"],
            reasoning_effort=config.LLM_CONFIG["reasoning_effort"],
            messages=[
                {"role": "system", "content": COMBINED_REPORT_PROMPT},
                {"role": "user",   "content": payload},
            ],
            response_format={"type": "json_schema", "json_schema": COMBINED_REPORT_SCHEMA},
        )
        raw           = response.choices[0].message.content
        finish_reason = response.choices[0].finish_reason
        return parse_json_response(raw, finish_reason, fallback, "generate_combined_report")
    except Exception as e:
        print(f"[generate_combined_report] ERROR: {e}")
        fallback["doctorReport"]["confidenceNote"] = f"Error: {e}"
        return fallback
