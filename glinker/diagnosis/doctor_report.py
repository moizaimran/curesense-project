# ==============================================================================
# glinker/diagnosis/doctor_report.py — doctor-facing grounded report
# ==============================================================================
import json
from glinker import config
from glinker.utils import parse_json_response
from glinker.diagnosis.prompts import DIAGNOSE_PROMPT, DIAGNOSE_SCHEMA


def _format_chunks(retrieved_chunks: list[dict]) -> str:
    if not retrieved_chunks:
        return (
            "No relevant reference material was retrieved above the similarity threshold. "
            "Route from stated symptoms and entities alone."
        )
    parts = []
    for c in retrieved_chunks:
        label = f"Source: {c['source']}"
        if c.get("title"):  label += f" | {c['title']}"
        label += f" | Score: {c['score']}"
        parts.append(f"[{label}]\n{c['text']}")
    return "\n\n".join(parts)


def _format_med_info(medication_info: dict[str, dict]) -> str:
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


def diagnose_for_doctor(
    transcript_text: str,
    verified_entities: list[dict],
    retrieved_chunks: list[dict],
    medication_info: dict[str, dict],
) -> dict:
    """
    Doctor-facing report grounded in retrieved textbook/guideline chunks and
    openFDA medication data. Degrades gracefully when either is empty.

    retrieved_chunks  : from retrieval.retrieve_context()
    medication_info   : from retrieval.get_medication_info() — may be {}
    """
    payload = json.dumps({
        "transcript"      : transcript_text,
        "verifiedEntities": verified_entities,
        "retrievedChunks" : _format_chunks(retrieved_chunks),
        "medicationInfo"  : _format_med_info(medication_info),
    })

    fallback = {
        "specialtyRecommendation": "General Medicine",
        "specialtyReasoning"     : "Doctor report generation failed — defaulted.",
        "clinicalConsiderations" : [],
        "medicationFlags"        : [],
        "retrievalStatus"        : "no_relevant_content",
        "confidenceNote"         : "diagnose_for_doctor call failed.",
    }

    try:
        response = config.openai_client.chat.completions.create(
            model=config.LLM_CONFIG["model"],
            max_completion_tokens=config.LLM_CONFIG["diagnose_max_tokens"],
            reasoning_effort=config.LLM_CONFIG["reasoning_effort"],
            messages=[
                {"role": "system", "content": DIAGNOSE_PROMPT},
                {"role": "user",   "content": payload},
            ],
            response_format={"type": "json_schema", "json_schema": DIAGNOSE_SCHEMA},
        )
        raw           = response.choices[0].message.content
        finish_reason = response.choices[0].finish_reason
        return parse_json_response(raw, finish_reason, fallback, "diagnose_for_doctor")
    except Exception as e:
        print(f"[diagnose_for_doctor] ERROR: {e}")
        fallback["confidenceNote"] = f"Error: {e}"
        return fallback
