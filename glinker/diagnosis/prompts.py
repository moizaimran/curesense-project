# ==============================================================================
# glinker/diagnosis/prompts.py
# ==============================================================================
import json

# ── FINALIZE ──────────────────────────────────────────────────────────────────

FINALIZE_PROMPT = (
    "You receive a completed patient intake transcript (already spelling-corrected) and "
    "a list of entities (category + keyword + ner_confidence 0-1) an NLP model extracted "
    "from it. You do FOUR jobs in one pass and return all as JSON:\n"
    "\n"
    "JOB 1 — VERIFY ENTITIES. Valid categories: symptom, medical condition, body part, "
    "severity, duration, medication, dosage, frequency, allergy, trigger.\n"
    "USE ner_confidence AS A PRIOR — for high-confidence spans (>=0.6) do a quick "
    "pass/fail against the 4 tests below. Spend real effort on low-confidence entities "
    "and on things only you can catch: negation, denial, stated-fact vs. inferred.\n"
    "Keep an entity only if it passes ALL four tests. Fail one → drop entirely.\n"
    "  a. AFFIRMED, NOT DENIED — patient asserts this is true right now. Reject anything "
    "denied, ruled out, or described as absent in ANY phrasing.\n"
    "  b. CONCRETE, NOT VAGUE — keyword must name a specific thing. Drop vague hedge words "
    "when a concrete value for the same thing exists.\n"
    "  c. STATED, NOT GUESSED — if patient names a reason/purpose, keep it. Drop only when "
    "patient gives no purpose at all.\n"
    "  d. RIGHT CATEGORY — pick the category that matches what the phrase actually IS.\n"
    "LINK MODIFIERS: set relates_to to \"\" for standalone items (symptom, medical "
    "condition, medication, allergy, trigger). For modifier categories (severity, duration, "
    "dosage, frequency, body part) set it to the exact keyword of what it modifies.\n"
    "\n"
    "JOB 2 — RAG QUERIES. Write THREE dense clinical search strings for vector retrieval, "
    "each phrasing the same clinical situation from a different angle. "
    "ALWAYS write full medical terms — NEVER use abbreviations (write 'hypertension' not 'HTN', "
    "'myocardial infarction' not 'MI', 'chronic obstructive pulmonary disease' not 'COPD'). "
    "Put all three in \"ragQueries\" (array of 3 strings):\n"
    "  ragQueries[0] — symptom-focused: chief complaint + site + character + duration + associated features\n"
    "  ragQueries[1] — condition-focused: likely condition names + clinical context + relevant medications\n"
    "  ragQueries[2] — treatment-focused: management approach + drug class + relevant comorbidities\n"
    "  Good[0]: \"right-sided throbbing headache photophobia nausea two days\"\n"
    "  Good[1]: \"migraine presentation right temporal headache visual sensitivity losartan hypertension\"\n"
    "  Good[2]: \"acute migraine episode antihypertensive losartan blood pressure\"\n"
    "  Bad:  \"Patient has had a headache on the right side since yesterday.\"\n"
    "\n"
    "JOB 3 — DIAGNOSTIC QUERY. Write a symptom-focused keyword string specifically "
    "designed for semantic disease retrieval. Include ONLY presenting symptoms, signs, "
    "and body parts — NO medications, NO clinical abbreviations, NO lab values, "
    "NO condition names. Use plain descriptive terms that match how symptoms are listed "
    "in symptom-disease datasets. Put in \"diagnosticQuery\".\n"
    "\n"
    "FREQUENCY NORMALIZATION — convert patient phrasing about timing and pattern into "
    "the disease corpus vocabulary before writing diagnosticQuery:\n"
    "  • Timing: 'acute' (hours to a few days) or 'chronic' (weeks, months, recurring)\n"
    "  • Pattern: 'constant' (continuous, unrelenting) or 'episodic' (comes and goes)\n"
    "  Examples:\n"
    "    'comes and goes for months' → chronic episodic\n"
    "    'started this morning and hasn't let up' → acute constant\n"
    "Use these normalized terms in diagnosticQuery — not the patient's original phrasing.\n"
    "\n"
    "SEVERITY EXCLUSION — never include severity in diagnosticQuery: no numeric scores "
    "(e.g. '6/10', '8/10'), no severity adjectives (mild, moderate, severe, intense). "
    "The disease corpus has no severity data — severity terms reduce retrieval accuracy.\n"
    "\n"
    "  Good: \"throbbing headache left side behind eye temple nausea blurry vision "
    "light sensitivity chronic episodic\"\n"
    "  Bad:  \"migraine ibuprofen 8/10 severe retro-orbital\"\n"
    "\n"
    "JOB 4 — MEDICATION NAMES. List every medication the patient takes: each kept entity with "
    "category \"medication\" AND every entry in \"profileMedications\" (medicines saved in the "
    "patient's profile). For each, put the text exactly as given in \"name\" and its US generic "
    "(USAN) name as printed on FDA drug labels in \"genericName\": lowercase, no dose, strength, "
    "form or frequency. Translate brand and local names (e.g. Panadol → acetaminophen, "
    "Brufen → ibuprofen, Augmentin → amoxicillin and clavulanate potassium, paracetamol → "
    "acetaminophen, salbutamol → albuterol). Join combination ingredients with \" and \". "
    "Use \"unknown\" only if you cannot identify the medicine. Put in \"medications\".\n"
    "\n"
    "Never call a tool. Return only the JSON object the schema requires — no extra text."
)

FINALIZE_SCHEMA = {
    "name"  : "finalized_report",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "entities": {
                "type": "array",
                "items": {
                    "type"      : "object",
                    "properties": {
                        "category"  : {"type": "string"},
                        "keyword"   : {"type": "string"},
                        "relates_to": {"type": "string"},
                    },
                    "required"            : ["category", "keyword", "relates_to"],
                    "additionalProperties": False,
                },
            },
            "ragQueries"     : {"type": "array", "items": {"type": "string"}},
            "diagnosticQuery": {"type": "string"},
            "medications": {
                "type": "array",
                "items": {
                    "type"      : "object",
                    "properties": {
                        "name"       : {"type": "string"},
                        "genericName": {"type": "string"},
                    },
                    "required"            : ["name", "genericName"],
                    "additionalProperties": False,
                },
            },
        },
        "required"            : ["entities", "ragQueries", "diagnosticQuery", "medications"],
        "additionalProperties": False,
    },
}

FINALIZE_FEWSHOT = [
    {
        "role": "user",
        "content": json.dumps({
            "transcript": (
                "Doctor, I'm not feeling well. Head is feeling unwell, right side. It is "
                "throbbing, like beating-beating pain. It started since two days, sudden "
                "headache on right side. It stay on right side, not going other place. Little "
                "nausea is there, but no vomiting. Bright light make pain more. It is there "
                "most time since two days, throbbing very much. Umm, six, I think. It is "
                "quite bad, but not very very worst. I take Losartan, 50 milligram, one time "
                "every day for blood pressure. No medicine allergy, I think."
            ),
            "entities": [
                {"category": "symptom",           "keyword": "headache",          "ner_confidence": 0.93},
                {"category": "body part",         "keyword": "right side",        "ner_confidence": 0.85},
                {"category": "symptom",           "keyword": "throbbing",         "ner_confidence": 0.71},
                {"category": "duration",          "keyword": "two days",          "ner_confidence": 0.88},
                {"category": "symptom",           "keyword": "nausea",            "ner_confidence": 0.80},
                {"category": "trigger",           "keyword": "bright light",      "ner_confidence": 0.66},
                {"category": "severity",          "keyword": "six",               "ner_confidence": 0.55},
                {"category": "severity",          "keyword": "quite bad",         "ner_confidence": 0.40},
                {"category": "medication",        "keyword": "Losartan",          "ner_confidence": 0.96},
                {"category": "dosage",            "keyword": "50 milligram",      "ner_confidence": 0.90},
                {"category": "frequency",         "keyword": "one time every day","ner_confidence": 0.82},
                {"category": "medical condition", "keyword": "blood pressure",    "ner_confidence": 0.74},
                {"category": "allergy",           "keyword": "medicine allergy",  "ner_confidence": 0.38},
            ],
        }),
    },
    {
        "role": "assistant",
        "content": json.dumps({
            "entities": [
                {"category": "symptom",           "keyword": "headache",           "relates_to": ""},
                {"category": "body part",         "keyword": "right side",         "relates_to": "headache"},
                {"category": "symptom",           "keyword": "throbbing",          "relates_to": ""},
                {"category": "duration",          "keyword": "two days",           "relates_to": "headache"},
                {"category": "symptom",           "keyword": "nausea",             "relates_to": ""},
                {"category": "trigger",           "keyword": "bright light",       "relates_to": "headache"},
                {"category": "severity",          "keyword": "six out of ten",     "relates_to": "headache"},
                {"category": "medication",        "keyword": "Losartan",           "relates_to": ""},
                {"category": "dosage",            "keyword": "50 milligram",       "relates_to": "Losartan"},
                {"category": "frequency",         "keyword": "one time every day", "relates_to": "Losartan"},
                {"category": "medical condition", "keyword": "blood pressure",     "relates_to": ""},
            ],
            "ragQueries": [
                "right-sided throbbing headache photophobia nausea two days",
                "migraine presentation right temporal headache visual sensitivity losartan hypertension",
                "acute headache episode antihypertensive losartan blood pressure right side",
            ],
            "diagnosticQuery": (
                "throbbing headache right side nausea light sensitivity photophobia "
                "moderate severe constant two days"
            ),
            "medications": [{"name": "Losartan", "genericName": "losartan"}],
        }),
    },
]



# ── INTERVIEW CHECKPOINT ─────────────────────────────────────────────────────

CHECKPOINT_PROMPT = (
    "You are a clinical diagnostic AI. Review this patient interview conversation "
    "and identify the most likely diseases or conditions based ONLY on symptoms the "
    "patient has explicitly reported.\n\n"
    "Rules:\n"
    "- Use ONLY what the patient has reported — do NOT infer symptoms not mentioned\n"
    "- Each entry must have a valid ICD-10 code\n"
    "- Confidence is 0.0–1.0 (how well this condition explains the reported symptoms)\n"
    "- List up to 8 conditions, most likely first\n\n"
    "Return valid JSON only — no explanation, no markdown."
)

CHECKPOINT_SCHEMA = {
    "name"  : "interview_checkpoint",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "diseases": {
                "type": "array",
                "items": {
                    "type"      : "object",
                    "properties": {
                        "name"      : {"type": "string"},
                        "icdCode"   : {"type": "string"},
                        "confidence": {"type": "number"},
                    },
                    "required"            : ["name", "icdCode", "confidence"],
                    "additionalProperties": False,
                },
            },
        },
        "required"            : ["diseases"],
        "additionalProperties": False,
    },
}


def build_differential_prompt(diseases: list[dict]) -> str:
    """System prompt injected on turns 6–10 to focus on differential questioning."""
    lines = "\n".join(
        f"{i+1}. {d['name']} (ICD: {d['icdCode']}) — {int(d['confidence'] * 100)}% confidence"
        for i, d in enumerate(diseases)
    )
    return (
        f"Based on symptoms reported so far, the top likely conditions are:\n{lines}\n\n"
        "Focus your next questions on differentiating between these conditions. "
        "Ask about symptoms that would confirm or rule out each one. "
        "Do NOT re-ask about symptoms already reported."
    )


def build_closing_prompt(diseases: list[dict]) -> str:
    """System prompt injected on turns 11–15 to close the interview."""
    lines = "\n".join(
        f"{i+1}. {d['name']} (ICD: {d['icdCode']})"
        for i, d in enumerate(diseases[:5])
    )
    return (
        f"Based on all reported symptoms, the most likely conditions are:\n{lines}\n\n"
        "You have a few questions remaining. Ask 1–2 final clarifying questions "
        "to confirm the leading diagnosis, then close the interview naturally. "
        "Do not introduce any new symptom areas."
    )


# The example intake has no saved profile medicines; keep its input shape aligned with real requests.
for _msg in FINALIZE_FEWSHOT:
    if _msg["role"] == "user":
        _payload = json.loads(_msg["content"])
        _payload.setdefault("profileMedications", [])
        _msg["content"] = json.dumps(_payload)
