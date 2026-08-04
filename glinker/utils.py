# ==============================================================================
# glinker/utils.py — shared helpers
# ==============================================================================
import json
from glinker import config


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


def call_llm(messages, schema, token_key, fallback, label):
    """
    Standard LLM call used by every pipeline step.
    token_key: key in config.LLM_CONFIG for max_completion_tokens
               (e.g. "finalize_max_tokens", "diagnose_max_tokens").
    Raises on network/API errors — caller decides whether to catch.
    """
    response = config.openai_client.chat.completions.create(
        model=config.LLM_CONFIG["model"],
        max_completion_tokens=config.LLM_CONFIG[token_key],
        reasoning_effort=config.LLM_CONFIG["reasoning_effort"],
        messages=messages,
        response_format={"type": "json_schema", "json_schema": schema},
    )
    raw           = response.choices[0].message.content
    finish_reason = response.choices[0].finish_reason
    return parse_json_response(raw, finish_reason, fallback, label)
