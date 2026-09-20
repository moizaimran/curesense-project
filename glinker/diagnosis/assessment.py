# ==============================================================================
# glinker/diagnosis/assessment.py
#
# Call 1 of 3 in the refactored pipeline.
#
# generate_diagnosis_assessment() performs clinical reasoning:
#   - Evaluates HPO/ICD-10 disease candidates (plausibility)
#   - Flags medication safety against the presenting complaint
#   - Assesses emergency status (LLM + code-based, merged)
#
# ==============================================================================
import json

from glinker.utils import call_llm
from glinker.rag.retrieval import trim_medication_info
from glinker.diagnosis.emergency_flags import check_emergency_list
from glinker.diagnosis.assessment_prompts import (
    ASSESSMENT_PROMPT,
    ASSESSMENT_SCHEMA,
    ASSESSMENT_FEWSHOT,
)


def _fmt_chunks(chunks: list[dict]) -> str:
    if not chunks:
        return (
            "No relevant reference material was retrieved above the similarity threshold. "
            "Route clinical reasoning from verified entities alone."
        )
    parts = []
    for c in chunks:
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
            f"  [{sec.replace('_', ' ').title()}]: {text}"
            for sec, text in info.get("sections", {}).items()
        )
        parts.append(f"Drug: {drug} (Source: {info.get('source', 'openFDA')})\n{sections_text}")
    return "\n\n".join(parts)


def _fmt_candidates(ranked_diseases: list[dict]) -> str:
    if not ranked_diseases:
        return (
            "No disease candidates retrieved from the knowledge base. "
            "Generate likely/possible conditions from the verified entities "
            "using your clinical knowledge — see JOB 1 instructions."
        )
    parts = []
    for i, d in enumerate(ranked_diseases[:10], 1):
        icd    = f" [{d['icd_code']}]" if d.get("icd_code") else ""
        conf   = f"(similarity {d.get('confidence', 0):.1f}%)"
        detail = d.get("paragraph") or d.get("disease", "Unknown")
        parts.append(f"Candidate {i}{icd} {conf}:\n{detail}")
    return (
        "Semantic search retrieved the following disease candidates from the "
        "HPO + ICD-10 knowledge base:\n\n" + "\n\n".join(parts)
    )


def _merge_emergency(llm_warning: dict, code_check: dict | None) -> dict:
    """
    Merge the LLM's emergencyWarning with the code-based check_emergency_list result.
    triggered = True if either source fires — the code check is the safety net and
    must never be silently dropped.
    """
    if llm_warning.get("triggered"):
        return llm_warning   # LLM caught it; keep its clinician-written reason/message

    if code_check:
        # Code caught something the LLM missed — override
        return {
            "triggered": True,
            "reason"   : code_check["reason"],
            "message"  : (
                "Please call emergency services (999/911) immediately — "
                "the symptoms described may indicate a life-threatening condition "
                f"({code_check['icdCode']}) that requires urgent hospital care."
            ),
        }

    return llm_warning   # both False


_ASSESSMENT_FALLBACK = {
    "interpretedDiagnoses": [],
    "medicationFlags"     : [],
    "emergencyWarning"    : {"triggered": False, "reason": "", "message": ""},
}


def generate_diagnosis_assessment(
    verified_entities : list[dict],
    ranked_diseases   : list[dict],
    medication_info   : dict,
    retrieved_chunks  : list[dict],
    transcript_text   : str = "",
) -> dict:
    """
    Call 1 of 3 in the refactored pipeline.

    Returns:
      {
        "interpretedDiagnoses": [...],
        "medicationFlags"     : [...],
        "emergencyWarning"    : {"triggered": bool, "reason": str, "message": str},
      }

    Emergency is doubly verified: LLM assessment merged with check_emergency_list()
    so a missed LLM flag can never silently drop a life-threatening condition.
    """
    trimmed_meds = trim_medication_info(medication_info)

    payload = json.dumps({
        "transcript"          : transcript_text,
        "verifiedEntities"    : verified_entities,
        "retrievedChunks"     : _fmt_chunks(retrieved_chunks),
        "medicationInfo"      : _fmt_medications(trimmed_meds),
        "diagnosticCandidates": _fmt_candidates(ranked_diseases),
    })

    messages = [
        {"role": "system", "content": ASSESSMENT_PROMPT},
        *ASSESSMENT_FEWSHOT,
        {"role": "user", "content": payload},
    ]

    # Shallow copy immediately — parse_json_response returns the fallback object
    # by reference on failure, and we mutate result["emergencyWarning"] below.
    # {**result} breaks the shared reference before any mutation, protecting
    # _ASSESSMENT_FALLBACK from being corrupted across subsequent failed calls.
    result = {**call_llm(
        messages,
        ASSESSMENT_SCHEMA,
        "diagnose_max_tokens",
        _ASSESSMENT_FALLBACK,
        "generate_diagnosis_assessment",
    )}

    code_check = check_emergency_list(result.get("interpretedDiagnoses", []))

    result["emergencyWarning"] = _merge_emergency(
        result.get("emergencyWarning", _ASSESSMENT_FALLBACK["emergencyWarning"]),
        code_check,
    )

    return result
