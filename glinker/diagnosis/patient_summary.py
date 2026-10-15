# ==============================================================================
# glinker/diagnosis/patient_summary.py
#
# Call 3 of 3 in the refactored pipeline.
#
# generate_patient_summary() assembles the patient-facing report:
#   - LLM writes: patientComplaintSummary, researchSummary, selfCareGuidance,
#                 referralSpecialty, medicationNotes (one note per drug)
#
# _fmt_chunks and _fmt_medications imported from assessment.py.
# Move both to glinker/diagnosis/_helpers.py when all three calls are complete.
# ==============================================================================
import copy
import json

from glinker.utils import call_llm
from glinker.rag.retrieval import trim_medication_info
from glinker.diagnosis.assessment import _fmt_chunks, _fmt_medications
from glinker.diagnosis.patient_summary_prompts import (
    PATIENT_SUMMARY_PROMPT,
    PATIENT_SUMMARY_SCHEMA,
    PATIENT_SUMMARY_FEWSHOT,
)

_PATIENT_SUMMARY_FALLBACK = {
    "patientComplaintSummary": "We received your description of your symptoms.",
    "researchSummary"        : "We weren't able to find specific health guidance matching your symptoms right now.",
    "selfCareGuidance"       : [],
    "referralSpecialty"      : "General Physician",
    "medicationNotes"        : [],
}

def _allowed_specialty(value, specialties):
    """Fallback replies and unexpected values become the general default."""
    default = _PATIENT_SUMMARY_FALLBACK["referralSpecialty"]
    if not value:
        return default
    return value if not specialties or value in specialties else default



def generate_patient_summary(
    assessment              : dict,
    verified_entities       : list[dict],
    retrieved_patient_chunks: list[dict],
    medication_info         : dict,
    transcript_text         : str = "",
    specialties             : list[str] | None = None,
    patient_profile         : dict | None = None,
) -> dict:
    """
    Call 3 of 3 in the refactored pipeline.

    Returns:
      {
        "patientComplaintSummary": str,
        "researchSummary"        : str,
        "selfCareGuidance"       : [{"point": str}, ...],
        "referralSpecialty"      : str,
        "medicationNotes"        : [{"drug": str, "note": str}, ...],
      }

    Condition explanations for the patient are the patientNote of each likely/possible
    entry in the assessment's interpretedDiagnoses — not repeated here.

    medicationNotes: LLM writes one note per drug in medication_info.keys().
    Drugs with a flag in assessment["medicationFlags"] get their flag translated
    into patient language. Drugs without a flag get a calm "no concerns" note.
    medication_info.keys() is the authoritative drug list — it already merged
    session-extracted drugs and profile medications before the FDA lookup.
    """
    trimmed_meds = trim_medication_info(medication_info)

    payload = json.dumps({
        "transcript"            : transcript_text,
        "verifiedEntities"      : verified_entities,
        "retrievedPatientChunks": _fmt_chunks(retrieved_patient_chunks),
        "medicationNames"       : list(medication_info.keys()),
        "medicationFlags"       : assessment.get("medicationFlags", []),
        "medicationInfo"        : _fmt_medications(trimmed_meds),
        "allowedSpecialties"    : specialties or [],
        "patientProfile"        : patient_profile or {},
    })

    # Lock referralSpecialty to the backend's list so it always matches a registrable doctor
    schema = PATIENT_SUMMARY_SCHEMA
    if specialties:
        schema = copy.deepcopy(PATIENT_SUMMARY_SCHEMA)
        schema["schema"]["properties"]["referralSpecialty"] = {"type": "string", "enum": list(specialties)}

    messages = [
        {"role": "system", "content": PATIENT_SUMMARY_PROMPT},
        *PATIENT_SUMMARY_FEWSHOT,
        {"role": "user", "content": payload},
    ]

    try:
        llm_result = call_llm(
            messages,
            schema,
            "diagnose_max_tokens",
            _PATIENT_SUMMARY_FALLBACK,
            "generate_patient_summary",
        )
    except Exception as e:
        print(f"[generate_patient_summary] LLM call failed: {e} — using fallback")
        llm_result = _PATIENT_SUMMARY_FALLBACK

    # No shallow copy needed — we build a fresh dict from llm_result values,
    # never mutate llm_result in place.
    return {
        "patientComplaintSummary": llm_result.get(
            "patientComplaintSummary",
            _PATIENT_SUMMARY_FALLBACK["patientComplaintSummary"],
        ),
        "researchSummary"        : llm_result.get(
            "researchSummary",
            _PATIENT_SUMMARY_FALLBACK["researchSummary"],
        ),
        "selfCareGuidance"       : llm_result.get(
            "selfCareGuidance",
            _PATIENT_SUMMARY_FALLBACK["selfCareGuidance"],
        ),
        "referralSpecialty"      : _allowed_specialty(llm_result.get("referralSpecialty"), specialties),
        "medicationNotes"        : llm_result.get(
            "medicationNotes",
            _PATIENT_SUMMARY_FALLBACK["medicationNotes"],
        ),
    }
