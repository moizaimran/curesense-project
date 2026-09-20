# ==============================================================================
# glinker/diagnosis/doctor_report.py
#
# Call 2 of 3 in the refactored pipeline.
#
# generate_doctor_report() assembles the clinician-facing report:
#   - LLM writes patientComplaintSummary and ragSummary (genuinely new writing)
#   - medicationFlags  — copied from assessment, no re-generation
#   - topDiagnoses     — first 5 of assessment["interpretedDiagnoses"], no re-ranking
#
# _fmt_chunks is imported from assessment.py rather than duplicated.
# When all three calls exist, move shared formatters to glinker/diagnosis/_helpers.py.
# ==============================================================================
import json

from glinker.utils import call_llm
from glinker.diagnosis.assessment import _fmt_chunks
from glinker.diagnosis.doctor_report_prompts import (
    DOCTOR_REPORT_PROMPT,
    DOCTOR_REPORT_SCHEMA,
    DOCTOR_REPORT_FEWSHOT,
)

_DOCTOR_REPORT_FALLBACK = {
    "patientComplaintSummary": "We received your description of your symptoms.",
    "ragSummary"             : "No relevant reference material was found for this symptom pattern.",
}


def generate_doctor_report(
    assessment       : dict,
    verified_entities: list[dict],
    retrieved_chunks : list[dict],
    transcript_text  : str = "",
) -> dict:
    """
    Call 2 of 3 in the refactored pipeline.

    Returns:
      {
        "patientComplaintSummary": str,
        "ragSummary"             : str,
        "medicationFlags"        : [...],   # from assessment — not re-generated
        "topDiagnoses"           : [...],   # first 5 from assessment — not re-ranked
      }
    """
    payload = json.dumps({
        "transcript"      : transcript_text,
        "verifiedEntities": verified_entities,
        "retrievedChunks" : _fmt_chunks(retrieved_chunks),
    })

    messages = [
        {"role": "system", "content": DOCTOR_REPORT_PROMPT},
        *DOCTOR_REPORT_FEWSHOT,
        {"role": "user", "content": payload},
    ]

    try:
        llm_result = call_llm(
            messages,
            DOCTOR_REPORT_SCHEMA,
            "diagnose_max_tokens",
            _DOCTOR_REPORT_FALLBACK,
            "generate_doctor_report",
        )
    except Exception as e:
        print(f"[generate_doctor_report] LLM call failed: {e} — using fallback")
        llm_result = _DOCTOR_REPORT_FALLBACK

    # No shallow copy needed here — we only read from llm_result to build a new
    # dict, never mutate it in place, so _DOCTOR_REPORT_FALLBACK stays clean.
    return {
        "patientComplaintSummary": llm_result.get(
            "patientComplaintSummary",
            _DOCTOR_REPORT_FALLBACK["patientComplaintSummary"],
        ),
        "ragSummary"     : llm_result.get(
            "ragSummary",
            _DOCTOR_REPORT_FALLBACK["ragSummary"],
        ),
        "medicationFlags": assessment.get("medicationFlags", []),
        "topDiagnoses"   : assessment.get("interpretedDiagnoses", [])[:5],
    }
