# ==============================================================================
# glinker/utils.py — shared helpers
# ==============================================================================
import json


def parse_json_response(raw_content, finish_reason, fallback, label):
    """
    Defensive JSON parse for all LLM responses.
    Structured Outputs make bad JSON rare, but a truncated completion (token
    cap hit mid-output) can still break the JSON. Logs clearly and returns
    the typed fallback instead of raising.
    """
    cleaned = raw_content.strip() if raw_content else ""
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except (json.JSONDecodeError, TypeError) as err:
        print(f"[{label}] FAILED TO PARSE — {type(err).__name__}: {err}")
        print(f"[{label}] finish_reason: {finish_reason}")
        print(f"[{label}] raw model output: {raw_content!r}")
        return fallback
