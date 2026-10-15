# ==============================================================================
# glinker/diagnosis/finalize.py
#
# run_gliner()      — runs GLiNER once on the full transcript
# finalize_report() — LLM call: verify entities + ragQuery + diagnosticQuery
# ==============================================================================
import json
from glinker import config
from glinker.utils import call_llm
from glinker.diagnosis.prompts import FINALIZE_PROMPT, FINALIZE_SCHEMA, FINALIZE_FEWSHOT


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
    One LLM call: verifies GLiNER entities, writes a dense ragQuery for FAISS
    retrieval, and writes a symptom-only diagnosticQuery for TF-IDF ranking.

    rank_diseases is NOT called here — it runs in app.py after this returns,
    using the verified entities and diagnosticQuery produced below.
    """
    payload = json.dumps({
        "transcript": transcript_text,
        "entities"  : [
            {"category": e["category"], "keyword": e["text"], "ner_confidence": e["confidence"]}
            for e in gliner_entities
        ],
    })

    messages = [{"role": "system", "content": FINALIZE_PROMPT}]
    messages.extend(FINALIZE_FEWSHOT)
    messages.append({"role": "user", "content": payload})

    fallback = {
        "entities"       : [{"category": e["category"], "keyword": e["text"], "relates_to": ""} for e in gliner_entities],
        "ragQuery"       : "",
        "diagnosticQuery": "",
    }
    return call_llm(messages, FINALIZE_SCHEMA, "finalize_max_tokens", fallback, "finalize_report")
