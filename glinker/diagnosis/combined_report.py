# ==============================================================================
# glinker/diagnosis/combined_report.py
#
# Single LLM call that produces doctor report + patient summary +
# interpreted diagnoses in one structured output.
# Replaces the previous separate doctor_report.py + patient_summary.py calls.
# ==============================================================================
import json
from glinker.utils import call_llm
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
        return (
            "No disease candidates retrieved from the knowledge base. "
            "Use your clinical knowledge to identify likely/possible conditions "
            "from the verified entities — see STEP 2 instructions."
        )
    parts = []
    for i, d in enumerate(ranked_diseases[:10], 1):
        # Use the full rich paragraph if available (new disease_retrieval format)
        # Fall back to bare name + confidence (old TF-IDF format)
        if d.get("paragraph"):
            icd = f" [{d['icd_code']}]" if d.get("icd_code") else ""
            parts.append(
                f"Candidate {i}{icd} (similarity {d.get('confidence', 0):.1f}%):\n"
                f"{d['paragraph']}"
            )
        else:
            parts.append(
                f"Candidate {i}: {d.get('disease', 'Unknown')} "
                f"— similarity {d.get('confidence', 0):.1f}%"
            )
    return (
        "Semantic search retrieved the following disease candidates from the "
        "HPO + ICD-10 + MedlinePlus knowledge base. Each includes symptom "
        "frequency data — use this to evaluate clinical plausibility:\n\n"
        + "\n\n".join(parts)
    )


def generate_combined_report(
    transcript_text: str,
    verified_entities: list[dict],
    retrieved_chunks: list[dict],
    medication_info: dict,
    ranked_diseases: list[dict],
    retrieval_status: str = "no_relevant_content",
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
        "retrievalStatus"     : retrieval_status,
        "retrievedChunks"     : _fmt_chunks(retrieved_chunks),
        "medicationInfo"      : _fmt_medications(medication_info),
        "diagnosticCandidates": _fmt_ranked_diseases(ranked_diseases),
    })

    fallback = {
        "doctorReport": {
            "patientComplaintSummary": "We received your description of your symptoms.",
            "ragSummary"             : "No reference material was retrieved.",
            "medicationFlags"        : [],
        },
        "patientSummary": {
            "patientComplaintSummary": "We received your description of your symptoms.",
            "referralSpecialty"      : "General Practitioner",
            "medicationNotes"        : [],
            "appointmentGuidance"    : [],
        },
        "interpretedDiagnoses": [],
    }

    messages = [
        {"role": "system", "content": COMBINED_REPORT_PROMPT},
        {"role": "user",   "content": payload},
    ]
    try:
        return call_llm(messages, COMBINED_REPORT_SCHEMA, "diagnose_max_tokens", fallback, "generate_combined_report")
    except Exception as e:
        print(f"[generate_combined_report] ERROR: {e}")
        fallback["doctorReport"]["confidenceNote"] = f"Error: {e}"
        return fallback
