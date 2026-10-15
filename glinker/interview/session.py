# ==============================================================================
# glinker/interview/session.py — per-turn interview LLM call
# ==============================================================================
from glinker.utils import call_llm
from glinker.interview.prompts import INTERVIEW_PROMPT, INTERVIEW_SCHEMA, INTERVIEW_FEWSHOT

def run_interview_turn(history_messages: list[dict], patient_message: str) -> dict:
    """
    One LLM call: given the conversation so far and the patient's newest (raw)
    message, returns {status, message, correctedPatientText}.
    Does NOT mutate history_messages — the caller decides what to store.
    """
    messages = history_messages + [{"role": "user", "content": patient_message}]
    fallback = {
        "status"              : "continue",
        "message"             : "Sorry, I had trouble processing that. Could you rephrase?",
        "correctedPatientText": patient_message,
        "questionType"        : "text",
        "options"             : [],
        "sessionName"         : "",
    }
    return call_llm(messages, INTERVIEW_SCHEMA, "interview_turn_max_tokens", fallback, "run_interview_turn")
