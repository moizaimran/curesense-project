# ==============================================================================
# glinker/diagnosis/finalize.py
#
# run_gliner()      — runs GLiNER once on the full transcript
# finalize_report() — LLM call: verify entities + summary + specialty + ragQuery
# ==============================================================================
import json
from glinker import config
from glinker.utils import parse_json_response
from glinker.diagnosis.prompts import FINALIZE_PROMPT, FINALIZE_SCHEMA, FINALIZE_FEWSHOT
from glinker.disease.ranker import rank_diseases


def run_gliner(text: str) -> list[dict]:
    """
    Run GLiNER once on the full transcript.
    Returns deduplicated, formatted entity list.
    """
    raw_entities = config.gliner_model.predict_entities(
        text, config.MEDICAL_LABELS, threshold=0.4
    )
    formatted, seen = [], set()
    for entity in raw_entities:
        key = (entity["text"].lower(), entity["label"])
        if key in seen:
            continue
        seen.add(key)
        formatted.append({
            "text"      : entity["text"],
            "category"  : entity["label"],
            "confidence": round(entity["score"], 3),
            "start"     : entity["start"],
            "end"       : entity["end"],
        })
    return formatted


def finalize_report(transcript_text: str, gliner_entities: list[dict]) -> dict:
    """
    One LLM call: verifies/extends GLiNER entities, writes clinical summary,
    suggests specialty, and generates a dense ragQuery for retrieval.
    """
    # Run disease ranking from raw GLiNER entities (returns [] if ranker not loaded)
    _entity_query   = " ".join(e["text"] for e in gliner_entities)
    ranked_diseases = rank_diseases(
        [{"category": e["category"], "keyword": e["text"], "relates_to": ""} for e in gliner_entities],
        _entity_query,
    )

    payload = json.dumps({
        "transcript"    : transcript_text,
        "rankedDiseases": ranked_diseases,
        "entities"      : [
            {"category": e["category"], "keyword": e["text"], "ner_confidence": e["confidence"]}
            for e in gliner_entities
        ],
    })

    messages = [{"role": "system", "content": FINALIZE_PROMPT}]
    messages.extend(FINALIZE_FEWSHOT)
    messages.append({"role": "user", "content": payload})

    response = config.openai_client.chat.completions.create(
        model=config.LLM_CONFIG["model"],
        max_completion_tokens=config.LLM_CONFIG["finalize_max_tokens"],
        reasoning_effort=config.LLM_CONFIG["reasoning_effort"],
        messages=messages,
        response_format={"type": "json_schema", "json_schema": FINALIZE_SCHEMA},
    )
    raw           = response.choices[0].message.content
    finish_reason = response.choices[0].finish_reason

    fallback = {
        "entities"      : [{"category": e["category"], "keyword": e["text"], "relates_to": ""} for e in gliner_entities],
        "ragQuery"      : "",
        "rankedDiseases": ranked_diseases,
    }
    return parse_json_response(raw, finish_reason, fallback, "finalize_report")
