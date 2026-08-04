# ==============================================================================
# glinker/interview/session.py — per-turn LLM call and PatientInterview session
# ==============================================================================
from glinker import config
from glinker.utils import call_llm
from glinker.interview.prompts import INTERVIEW_PROMPT, INTERVIEW_SCHEMA, INTERVIEW_FEWSHOT

LLM_CONFIG = config.LLM_CONFIG


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
    }
    return call_llm(messages, INTERVIEW_SCHEMA, "interview_turn_max_tokens", fallback, "run_interview_turn")


class PatientInterview:
    """
    One instance = one patient's ongoing intake conversation.

    self.history   : role-tagged turns shown to the model (system + few-shot + live)
    self.transcript_parts : corrected patient text from each turn — fed to GLiNER
    """

    def __init__(self):
        self.history          = [{"role": "system", "content": INTERVIEW_PROMPT}]
        self.history.extend(INTERVIEW_FEWSHOT)
        self.transcript_parts = []
        self.turns            = 0
        self.done             = False

    def send(self, patient_message: str) -> dict:
        if self.done:
            return {"status": "complete", "message": "This interview has already ended.", "correctedPatientText": patient_message}

        self.turns += 1
        turn = run_interview_turn(self.history, patient_message)

        corrected_text = turn.get("correctedPatientText", "").strip() or patient_message
        self.history.append({"role": "user",      "content": corrected_text})
        self.history.append({"role": "assistant",  "content": turn.get("message", "")})
        self.transcript_parts.append(corrected_text)

        # Hard safety cap: force completion when turn limit reached
        if self.turns >= LLM_CONFIG["interview_max_turns"] and turn["status"] != "complete":
            turn["status"]  = "complete"
            turn["message"] = (
                "Thanks for sharing all of this — I have what I need for now. "
                "The clinician will review your responses shortly."
            )

        if turn["status"] == "complete":
            self.done = True

        return turn

    def full_transcript(self) -> str:
        """Corrected patient turns joined into one string. Passed to GLiNER."""
        return " ".join(self.transcript_parts)
