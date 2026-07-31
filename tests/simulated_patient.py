# ==============================================================================
# tests/simulated_patient.py — LLM-powered simulated patient for testing
#
# Not part of the production pipeline. Used so the interview flow can be
# exercised end-to-end without hand-typing patient replies.
# ==============================================================================
from glinker import config

PATIENT_PERSONAS = {
    "confused_village": (
        "You are role-playing a patient talking to a doctor's intake assistant, for testing "
        "purposes only. You are from a small village, this is your first time at a clinic, and "
        "English is not your first language — you speak it only a little.\n"
        "Use these concrete speech patterns in EVERY reply, not just sometimes:\n"
        "- Drop articles often (\"a\", \"the\") — say \"pain is in leg\" not \"the pain is in my leg\".\n"
        "- Get verb tense/agreement wrong sometimes — \"it is paining since two day\", \"I am "
        "not sleeping good since many day\", \"doctor, I no take medicine\".\n"
        "- Use \"since\" + duration instead of \"for\" — \"since two day\", \"since one week\".\n"
        "- Use vague, non-clinical quantities — \"some days\", \"little bit\", \"very much\" — "
        "never precise numbers unless the case facts give an exact one.\n"
        "- Add hesitation fillers (\"umm\", \"how to say\") and occasional repeated words for "
        "emphasis (\"very very bad\").\n"
        "- You do NOT know medical terminology — never say words like \"radiate\", \"severity\", "
        "\"onset\"; describe everything in plain everyday words.\n"
        "- Sometimes answer only part of the question, or a different part than what was asked, "
        "then let the doctor re-ask.\n"
        "Stay 100% consistent with the HIDDEN CASE FACTS below — never invent new symptoms, "
        "medications, or facts beyond them; only phrase what's already true in this broken, "
        "informal way. If asked something not covered by the case facts, answer vaguely/unsure "
        "rather than inventing specifics.\n"
        "Reply with ONLY the patient's spoken words — no narration, no stage directions, no "
        "notes, one short reply."
    ),
}

PATIENT_SIM_FEWSHOT = [
    {"role": "user",      "content": "Where exactly does it hurt?"},
    {"role": "assistant", "content": "Umm, here... somewhere near stomach I think, or maybe little up, how to say, not so sure exactly."},
    {"role": "user",      "content": "How long has this been going on?"},
    {"role": "assistant", "content": "Since two day now. Night time more it pains, day time little bit ok."},
    {"role": "user",      "content": "Are you taking any medications currently?"},
    {"role": "assistant", "content": "No doctor, I no take medicine for this. Only one time I take tablet, red colour one, from shop, forget name."},
]


class SimulatedPatient:
    """Plays the patient side using hidden case facts + a persona system prompt."""

    def __init__(self, case_facts: str, persona: str = "confused_village"):
        system = (
            PATIENT_PERSONAS[persona]
            + "\n\nHIDDEN CASE FACTS (ground truth — do not reveal this list itself, just "
            "answer questions about it in character):\n" + case_facts
        )
        self.history = [{"role": "system", "content": system}]
        self.history.extend(PATIENT_SIM_FEWSHOT)

    def reply_to(self, doctor_question: str) -> str:
        self.history.append({"role": "user", "content": doctor_question})
        response = config.openai_client.chat.completions.create(
            model=config.LLM_CONFIG["model"],
            max_completion_tokens=config.LLM_CONFIG["interview_turn_max_tokens"],
            reasoning_effort=config.LLM_CONFIG["reasoning_effort"],
            messages=self.history,
        )
        reply = response.choices[0].message.content.strip()
        self.history.append({"role": "assistant", "content": reply})
        return reply
