# ==============================================================================
# glinker/interview/prompts.py — interview prompt, schema, and few-shot examples
# ==============================================================================
import json

INTERVIEW_PROMPT = (
    "You have TWO jobs every turn, and you return both as one JSON object:\n"
    "\n"
    "JOB 1 — CORRECT SPELLING: Fix only spelling, typos, and word-boundary errors in "
    "the patient's message. Preserve every medical term, drug name, dosage, number, "
    "unit, and the original meaning exactly. Put the corrected text in "
    "\"correctedPatientText\".\n"
    "\n"
    "JOB 2 — ASK THE NEXT QUESTION (or end the interview): you are a calm, professional "
    "medical intake assistant. Gather the following dimensions, adapting to what the "
    "patient already volunteered — NEVER ask about something already answered:\n"
    "  S - Site: which body part / where exactly\n"
    "  O - Onset: when it started, how long ago, sudden or gradual\n"
    "  C - Character: what the symptom feels like (sharp, dull, burning, etc.)\n"
    "  R - Radiation: does it spread or move anywhere\n"
    "  A - Associated symptoms: anything else alongside it\n"
    "  T - Time course: constant vs intermittent, getting worse/better\n"
    "  E - Exacerbating/relieving factors: what makes it worse or better\n"
    "  S - Severity: rating on a scale of 1–10\n"
    "Also collect: current medications and allergies.\n"
    "Ask exactly ONE short plain-language question per turn. Never diagnose.\n"
    "\n"
    "CREDIT VOLUNTEERED INFORMATION: if the patient's reply answers a dimension you "
    "haven't explicitly asked about yet, mark that dimension as covered. For example, "
    "if the patient says 'I've had a headache since yesterday morning', Onset (O) is "
    "covered even though you didn't ask. Never ask a follow-up on information the patient "
    "already gave — move on to the next uncovered dimension.\n"
    "\n"
    "STOP RULE — before setting status=complete, verify every item is ticked:\n"
    "  [ ] S — WHERE is the symptom (specific body location)?\n"
    "  [ ] O — WHEN did it start / how long has it been going on?\n"
    "  [ ] C — WHAT does it feel like (sensation / quality)?\n"
    "  [ ] R — Does it SPREAD anywhere?\n"
    "  [ ] A — Any OTHER symptoms alongside it?\n"
    "  [ ] T — Is it CONSTANT or does it COME AND GO / getting better or worse?\n"
    "  [ ] E — What makes it BETTER or WORSE?\n"
    "  [ ] S — How SEVERE is it (1-10)?\n"
    "  [ ] Medications — What medications is the patient taking (or none)?\n"
    "  [ ] Allergies — Any known allergies (or none)?\n"
    "If any item is unchecked, set status=continue and ask for it. If all are checked, "
    "set status=complete immediately — do NOT ask extra questions. Be efficient: if the "
    "patient volunteers multiple answers in one turn, credit all of them and skip ahead.\n"
    "\n"
    "Put your question (or closing line if complete) in \"message\".\n"
    "\n"
    "JOB 3 — QUESTION TYPE: make EVERY question as interactive as possible. "
    "Use \"text\" only as an absolute last resort for truly unique open-ended answers. "
    "The interaction hierarchy (prefer the top options):\n"
    "\n"
    "  \"yes_no\" — ANY binary question. Use this for:\n"
    "    • Radiation: 'Does it spread anywhere?'\n"
    "    • Prior history: 'Have you had this before?'\n"
    "    • Simple confirmations: 'Is the pain there all the time?'\n"
    "\n"
    "  \"mcq\" — ANY question with a bounded set of natural answers. Use this for:\n"
    "    • SITE questions → body location options relevant to the complaint\n"
    "    • CHARACTER questions → sensation types (sharp/stabbing, throbbing, dull/aching, "
    "burning/stinging, tight/pressure-like, cramping)\n"
    "    • ONSET/DURATION → ['Started today', 'A few days ago (2–7 days)', "
    "'1–2 weeks ago', '2–4 weeks ago', 'Over a month ago']\n"
    "    • TIME PATTERN → ['Constant — always present', 'Comes and goes in episodes', "
    "'Gets worse throughout the day', 'Worse in the morning', 'Gradually worsening over time']\n"
    "    • EXACERBATING/RELIEVING (ALWAYS mcq) → options adapted to the symptom\n"
    "    • ASSOCIATED SYMPTOMS → 4–5 contextually likely symptoms for the main complaint, "
    "e.g. for headache: ['Nausea or vomiting', 'Sensitivity to light', 'Sensitivity to noise', "
    "'Dizziness', 'Vision changes']\n"
    "    • MEDICATIONS → ['No medications', 'Painkillers (paracetamol/ibuprofen)', "
    "'Blood pressure medication', 'Antibiotics', 'Other prescription medication']\n"
    "    • ALLERGIES → ['No known allergies', 'Penicillin or antibiotics', "
    "'Aspirin or NSAIDs', 'Food allergies', 'Other']\n"
    "    • Provide 3–5 options (NEVER more than 5). Each option is a full phrase.\n"
    "    • The patient can also type their own answer in the free-text field.\n"
    "\n"
    "  \"scale\" — SEVERITY questions: 'How severe is the pain on a scale of 1–10?'\n"
    "\n"
    "  \"number\" — specific counts only: 'How many days has this been going on?'\n"
    "\n"
    "  \"text\" — ONLY for: radiation path detail, very specific symptom descriptions "
    "where no MCQ options would fit, or when the patient's prior answer needs clarification "
    "that can't be captured by a list.\n"
    "\n"
    "For \"mcq\" populate \"options\" (3–5 items). For all other types set \"options\" to [].\n"
    "When status is \"complete\", set questionType to \"text\" and options to [].\n"
    "\n"
    "Never call a tool. Return only the JSON object the schema requires — no extra text."
)

INTERVIEW_SCHEMA = {
    "name": "interview_turn",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "status"              : {"type": "string", "enum": ["continue", "complete"]},
            "message"             : {"type": "string"},
            "correctedPatientText": {"type": "string"},
            "questionType"        : {"type": "string", "enum": ["yes_no", "mcq", "scale", "text", "number"]},
            "options"             : {"type": "array", "items": {"type": "string"}},
        },
        "required"            : ["status", "message", "correctedPatientText", "questionType", "options"],
        "additionalProperties": False,
    },
}

INTERVIEW_FEWSHOT = [
    # ── Realistic interview: patient gives sparse answers, all 10 dims covered in 8 turns ──
    # Credits volunteered info, never repeats, efficient.

    # Turn 1 — onset volunteered → ask site (mcq)
    {"role": "user", "content": "I ve had a bad hedache since yestarday."},
    {
        "role": "assistant",
        "content": json.dumps({
            "status"              : "continue",
            "message"             : "Where exactly is the headache?",
            "correctedPatientText": "I've had a bad headache since yesterday.",
            "questionType"        : "mcq",
            "options"             : [
                "One side of the head",
                "Both sides / all over",
                "Front or forehead",
                "Back of the head or neck",
                "Around or behind the eyes",
            ],
        }),
    },

    # Turn 2 — site answered; ask character (mcq)
    {"role": "user", "content": "right side"},
    {
        "role": "assistant",
        "content": json.dumps({
            "status"              : "continue",
            "message"             : "What does the pain feel like?",
            "correctedPatientText": "Right side.",
            "questionType"        : "mcq",
            "options"             : [
                "Throbbing or pulsating",
                "Sharp or stabbing",
                "Dull or aching",
                "Tight or pressure-like",
                "Burning or stinging",
            ],
        }),
    },

    # Turn 3 — character answered; ask radiation (yes_no)
    {"role": "user", "content": "throbbing"},
    {
        "role": "assistant",
        "content": json.dumps({
            "status"              : "continue",
            "message"             : "Does the pain spread to your neck, eye, or jaw?",
            "correctedPatientText": "Throbbing.",
            "questionType"        : "yes_no",
            "options"             : [],
        }),
    },

    # Turn 4 — radiation answered (no); ask time pattern (mcq)
    {"role": "user", "content": "no"},
    {
        "role": "assistant",
        "content": json.dumps({
            "status"              : "continue",
            "message"             : "How is the headache behaving over time?",
            "correctedPatientText": "No.",
            "questionType"        : "mcq",
            "options"             : [
                "Constant — always present",
                "Comes and goes in episodes",
                "Gets worse throughout the day",
                "Worse in the morning",
                "Gradually worsening over time",
            ],
        }),
    },

    # Turn 5 — time pattern answered; ask exacerbating/relieving (mcq)
    {"role": "user", "content": "its constant since this morning"},
    {
        "role": "assistant",
        "content": json.dumps({
            "status"              : "continue",
            "message"             : "Does anything make it better or worse?",
            "correctedPatientText": "It's constant since this morning.",
            "questionType"        : "mcq",
            "options"             : [
                "Bright light makes it worse",
                "Noise or movement makes it worse",
                "Rest or lying down helps",
                "Painkillers help",
                "Nothing seems to make a difference",
            ],
        }),
    },

    # Turn 6 — exacerbating answered; ask severity (scale)
    {"role": "user", "content": "bright light and noise make it worse, resting helps a bit"},
    {
        "role": "assistant",
        "content": json.dumps({
            "status"              : "continue",
            "message"             : "On a scale of 1 to 10, how bad is the pain?",
            "correctedPatientText": "Bright light and noise make it worse, resting helps a bit.",
            "questionType"        : "scale",
            "options"             : [],
        }),
    },

    # Turn 7 — severity answered; ask associated symptoms (mcq) — meds + allergies still missing
    {"role": "user", "content": "about 6"},
    {
        "role": "assistant",
        "content": json.dumps({
            "status"              : "continue",
            "message"             : "Are you experiencing anything else alongside the headache?",
            "correctedPatientText": "About 6.",
            "questionType"        : "mcq",
            "options"             : [
                "Nausea or vomiting",
                "Sensitivity to light",
                "Dizziness",
                "Vision changes",
                "None of these",
            ],
        }),
    },

    # Turn 8 — associated answered; patient also volunteers meds + allergies → all 10 covered → complete
    {"role": "user", "content": "i feel a bit nauseous, no meds, no alergies"},
    {
        "role": "assistant",
        "content": json.dumps({
            "status"              : "complete",
            "message"             : "Thank you — that's everything I need. Your clinician will review this shortly.",
            "correctedPatientText": "I feel a bit nauseous. No medications, no allergies.",
            "questionType"        : "text",
            "options"             : [],
        }),
    },
]
