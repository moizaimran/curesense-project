# ==============================================================================
# glinker/images/correlation.py
#
# Correlates a MedGemma / PDF image analysis result with the clinical findings
# from the patient's interview report.
#
# Called by POST /images/correlate-with-report after the image analysis step
# completes for a post-session upload.
#
# PHI note: image_analysis and clinical_summary contain patient health data.
# They are sent to the LLM but never logged to console.
# ==============================================================================
import json

from glinker import config

_SYSTEM_PROMPT = """\
You are a clinical integration assistant. You receive two inputs:
  1. An image analysis result (from a radiology/scan/document analysis model).
  2. A clinical summary from the patient's symptom interview.

Your job is to write a concise clinical correlation that explains how the imaging
findings relate to the interview findings. Specifically:
  - Note any findings that SUPPORT the interview-based diagnosis candidates.
  - Note any findings that are INCONSISTENT with or UNEXPECTED given the interview.
  - Highlight any NEW clinically significant findings visible in the image that
    were not mentioned in the interview.
  - Keep the correlation under 200 words. Write in plain clinical language.
  - If the image analysis result is empty or unavailable, say so clearly.

Return a JSON object with a single key:
{
  "correlation": "<your clinical correlation text here>"
}"""


def correlate_image_with_report(image_analysis: dict, clinical_summary: dict) -> dict:
    """
    Generate a clinical correlation between scan findings and the interview report.

    Args:
        image_analysis:   The MedGemma or PDF analysis result dict from ImageUpload.
        clinical_summary: A compact dict with keys:
                            disease_ranking, complaint_summary, rag_summary,
                            interpreted_diagnoses

    Returns:
        {"correlation": "<text>"} on success,
        {"correlation": ""} if the model fails or clients are not configured.
    """
    if config.openai_client is None:
        return {"correlation": ""}

    analysis_text  = json.dumps(image_analysis,  indent=2) if image_analysis  else "No analysis available."
    summary_text   = json.dumps(clinical_summary, indent=2) if clinical_summary else "No clinical summary available."

    try:
        response = config.openai_client.chat.completions.create(
            model=config.LLM_CONFIG["model"],
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"IMAGE ANALYSIS:\n{analysis_text}\n\n"
                        f"CLINICAL SUMMARY FROM INTERVIEW:\n{summary_text}"
                    ),
                },
            ],
            max_completion_tokens=config.LLM_CONFIG.get("correlation_max_tokens", 600),
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content
        result = json.loads(raw)
        return {"correlation": result.get("correlation", "")}
    except Exception as exc:
        print(f"[correlate_image_with_report] LLM call failed: {exc}")
        return {"correlation": ""}
