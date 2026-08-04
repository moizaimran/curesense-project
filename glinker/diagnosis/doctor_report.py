# ==============================================================================
# glinker/diagnosis/doctor_report.py — doctor-facing grounded report
# ==============================================================================
import json
from glinker import config
from glinker.utils import parse_json_response
from glinker.diagnosis.prompts import DOCTOR_REPORT_PROMPT, DOCTOR_REPORT_SCHEMA


def _format_retrieved_chunks(retrieved_chunks: list[dict]) -> str:
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


def _format_medication_info(medication_info: dict[str, dict]) -> str:
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


def _format_ranked_diseases(ranked_diseases: list[dict]) -> str:
    if not ranked_diseases:
        return "No disease candidates available from the diagnostic module."
    lines = []
    for i, d in enumerate(ranked_diseases[:10], 1):
        lines.append(f"  {i}. {d.get('disease', 'Unknown')} — confidence {d.get('confidence', 0):.1f}/100")
    return "Top symptom-pattern candidates (TF-IDF, normalized to 100):\n" + "\n".join(lines)


def generate_doctor_report(
    transcript_text: str,
    verified_entities: list[dict],
    retrieved_chunks: list[dict],
    medication_info: dict[str, dict],
    ranked_diseases: list[dict],
) -> dict:
    """
    Doctor-facing report grounded in retrieved textbook/guideline chunks,
    openFDA medication data, and TF-IDF disease ranking candidates.
    Degrades gracefully when any input is empty.

    Returns a dict with keys matching DOCTOR_REPORT_SCHEMA.
    """
    payload = json.dumps({
        "transcript"       : transcript_text,
        "verifiedEntities" : verified_entities,
        "retrievedChunks"  : _format_retrieved_chunks(retrieved_chunks),
        "medicationInfo"   : _format_medication_info(medication_info),
        "diagnosticCandidates": _format_ranked_diseases(ranked_diseases),
    })

    fallback = {
        "interviewClinicalSummary"     : "Doctor report generation failed.",
        "retrievalAndMedicationSummary": "No retrieval summary available.",
        "recommendedSpecialty"         : "General Medicine",
        "specialtyReasoning"           : "Defaulted due to generation failure.",
        "guidelineConsiderations"      : [],
        "medicationFlags"              : [],
        "retrievalStatus"              : "no_relevant_content",
        "confidenceNote"               : "generate_doctor_report call failed.",
    }

    try:
        response = config.openai_client.chat.completions.create(
            model=config.LLM_CONFIG["model"],
            max_completion_tokens=config.LLM_CONFIG["diagnose_max_tokens"],
            reasoning_effort=config.LLM_CONFIG["reasoning_effort"],
            messages=[
                {"role": "system", "content": DOCTOR_REPORT_PROMPT},
                {"role": "user",   "content": payload},
            ],
            response_format={"type": "json_schema", "json_schema": DOCTOR_REPORT_SCHEMA},
        )
        raw           = response.choices[0].message.content
        finish_reason = response.choices[0].finish_reason
        return parse_json_response(raw, finish_reason, fallback, "generate_doctor_report")
    except Exception as e:
        print(f"[generate_doctor_report] ERROR: {e}")
        fallback["confidenceNote"] = f"Error: {e}"
        return fallback
