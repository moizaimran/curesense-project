# ==============================================================================
# glinker/diagnosis/patient_summary.py — plain-language patient-facing summary
# ==============================================================================
import json
from glinker import config
from glinker.utils import parse_json_response
from glinker.diagnosis.prompts import PATIENT_SUMMARY_PROMPT, PATIENT_SUMMARY_SCHEMA
from glinker.diagnosis.doctor_report import _format_chunks, _format_med_info


def summarize_for_patient(
    transcript_text: str,
    verified_entities: list[dict],
    retrieved_chunks: list[dict],
    medication_info: dict[str, dict],
) -> dict:
    """
    Plain-language summary for the patient. Uses the same retrieved content
    as the doctor report but reframes everything in everyday language.

    retrieved_chunks : from retrieval.retrieve_context()
    medication_info  : from retrieval.get_medication_info() — may be {}
    """
    payload = json.dumps({
        "transcript"      : transcript_text,
        "verifiedEntities": verified_entities,
        "retrievedChunks" : _format_chunks(retrieved_chunks),
        "medicationInfo"  : _format_med_info(medication_info),
    })

    fallback = {
        "whatWeHeard"    : "We received your description of your symptoms.",
        "specialty"      : "General Medicine",
        "whatToExpect"   : [],
        "yourMedications": [],
    }

    try:
        response = config.openai_client.chat.completions.create(
            model=config.LLM_CONFIG["model"],
            max_completion_tokens=config.LLM_CONFIG["patient_summary_max_tokens"],
            reasoning_effort=config.LLM_CONFIG["reasoning_effort"],
            messages=[
                {"role": "system", "content": PATIENT_SUMMARY_PROMPT},
                {"role": "user",   "content": payload},
            ],
            response_format={"type": "json_schema", "json_schema": PATIENT_SUMMARY_SCHEMA},
        )
        raw           = response.choices[0].message.content
        finish_reason = response.choices[0].finish_reason
        return parse_json_response(raw, finish_reason, fallback, "summarize_for_patient")
    except Exception as e:
        print(f"[summarize_for_patient] ERROR: {e}")
        return fallback
