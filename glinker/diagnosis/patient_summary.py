# ==============================================================================
# glinker/diagnosis/patient_summary.py — plain-language patient-facing summary
# ==============================================================================
import json
from glinker import config
from glinker.utils import parse_json_response
from glinker.diagnosis.prompts import PATIENT_SUMMARY_PROMPT, PATIENT_SUMMARY_SCHEMA
from glinker.diagnosis.doctor_report import _format_retrieved_chunks, _format_medication_info


def generate_patient_summary(
    transcript_text: str,
    verified_entities: list[dict],
    retrieved_chunks: list[dict],
    medication_info: dict[str, dict],
    ranked_diseases: list[dict],
) -> dict:
    """
    Plain-language summary for the patient. Uses the same retrieved content
    as the doctor report but reframes everything in everyday language.

    ranked_diseases : top-5 list from the disease ranking module — appended
                      directly to the result without going through the LLM.
    """
    payload = json.dumps({
        "transcript"      : transcript_text,
        "verifiedEntities": verified_entities,
        "retrievedChunks" : _format_retrieved_chunks(retrieved_chunks),
        "medicationInfo"  : _format_medication_info(medication_info),
    })

    fallback = {
        "patientComplaintSummary": "We received your description of your symptoms.",
        "referralSpecialty"      : "General Medicine",
        "appointmentGuidance"    : [],
        "medicationNotes"        : [],
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
        result = parse_json_response(raw, finish_reason, fallback, "generate_patient_summary")
    except Exception as e:
        print(f"[generate_patient_summary] ERROR: {e}")
        result = fallback

    # Top 5 diagnoses from the disease ranking module — added here, not via LLM
    result["topDiagnoses"] = ranked_diseases[:5]

    return result
