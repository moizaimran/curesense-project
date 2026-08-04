# ==============================================================================
# glinker/diagnosis/prompts.py
# ==============================================================================
import json

# ── FINALIZE ──────────────────────────────────────────────────────────────────

FINALIZE_PROMPT = (
    "You receive a completed patient intake transcript (already spelling-corrected) and "
    "a list of entities (category + keyword + ner_confidence 0-1) an NLP model extracted "
    "from it. You do THREE jobs in one pass and return all as JSON:\n"
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
    "JOB 2 — RAG QUERY. Write a dense clinical search string for vector retrieval. "
    "Compact keyword sequence: chief complaint + site + character + duration + severity "
    "+ associated features + relevant medications. Put in \"ragQuery\".\n"
    "  Good: \"right-sided throbbing headache photophobia nausea 6/10 two days losartan hypertension\"\n"
    "  Bad:  \"Patient has had a headache on the right side since yesterday.\"\n"
    "\n"
    "JOB 3 — DIAGNOSTIC QUERY. Write a symptom-focused keyword string specifically "
    "designed for a TF-IDF disease ranking model. Include ONLY presenting symptoms, signs, "
    "body parts, severity descriptors, and duration — NO medications, NO clinical "
    "abbreviations, NO lab values, NO condition names. Use plain descriptive terms that "
    "match how symptoms are listed in symptom-disease datasets. Put in \"diagnosticQuery\".\n"
    "  Good: \"throbbing headache left side behind eye temple nausea blurry vision light "
    "sensitivity severe constant worsening 24 hours\"\n"
    "  Bad:  \"migraine ibuprofen 8/10 retro-orbital\"\n"
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
            "ragQuery"       : {"type": "string"},
            "diagnosticQuery": {"type": "string"},
        },
        "required"            : ["entities", "ragQuery", "diagnosticQuery"],
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
            "ragQuery": (
                "right-sided throbbing headache photophobia nausea 6/10 two days "
                "losartan 50mg daily hypertension"
            ),
            "diagnosticQuery": (
                "throbbing headache right side nausea light sensitivity photophobia "
                "moderate severe constant two days"
            ),
        }),
    },
]


# ── DOCTOR REPORT ─────────────────────────────────────────────────────────────

DOCTOR_REPORT_PROMPT = (
    "You are a clinical decision support tool generating a doctor-facing pre-consultation "
    "report. Your output is for the CLINICIAN — write as if briefing a doctor before they "
    "see this patient.\n"
    "\n"
    "You receive: (1) the patient transcript, (2) verified clinical entities, "
    "(3) reference chunks from medical textbooks and clinical guidelines, "
    "(4) medication information from openFDA drug labels (may be empty), "
    "(5) top disease candidates from a TF-IDF diagnostic module with confidence scores "
    "(scores are normalized — top candidate = 100, others relative to it).\n"
    "\n"
    "You have SIX jobs:\n"
    "\n"
    "JOB 1 — INTERVIEW CLINICAL SUMMARY. In 2-3 sentences, write a concise technical "
    "summary of the clinical picture from the interview: chief complaint, key symptom "
    "features (site, character, severity, duration, onset), associated symptoms, relevant "
    "medications and allergies. This is the doctor's quick-read of the case.\n"
    "\n"
    "JOB 2 — RETRIEVAL AND MEDICATION SUMMARY. In 1-2 sentences, state what the retrieved "
    "reference material covers and what openFDA returned. If nothing retrieved, state that.\n"
    "\n"
    "JOB 3 — RECOMMENDED SPECIALTY. Recommend the single specialty most appropriate for "
    "referral, grounded in retrieved material where available. Cross-reference with the "
    "top disease candidates if relevant.\n"
    "\n"
    "JOB 4 — GUIDELINE CONSIDERATIONS. List 2-5 relevant points the retrieved reference "
    "material associates with this symptom pattern. Each point must cite its source. "
    "Frame as 'the guideline states...' — never as your own clinical judgment. "
    "Empty array if no retrieved material is relevant.\n"
    "\n"
    "JOB 5 — MEDICATION FLAGS. For each patient medication, surface relevant indications, "
    "contraindications, interactions, or dosage notes from the openFDA data. Each flag "
    "must cite its source. Empty array if no medications or no drug data.\n"
    "\n"
    "JOB 6 — RETRIEVAL STATUS. Set retrievalStatus to:\n"
    "  'grounded'            — retrieved material directly informed the recommendation\n"
    "  'partial'             — retrieved material is loosely related\n"
    "  'no_relevant_content' — nothing above threshold; route from symptoms only\n"
    "Explain in confidenceNote when 'no_relevant_content'.\n"
    "\n"
    "RULES: Every claim from retrieved content MUST include a citation. Never fabricate. "
    "Never diagnose. Use the diagnostic module candidates as a signal, not a verdict — "
    "they indicate symptom-pattern similarity, not confirmed diagnoses. "
    "Return only the JSON object the schema requires — no extra text."
)

DOCTOR_REPORT_SCHEMA = {
    "name"  : "doctor_report",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "interviewClinicalSummary"     : {"type": "string"},
            "retrievalAndMedicationSummary": {"type": "string"},
            "recommendedSpecialty"         : {"type": "string"},
            "specialtyReasoning"           : {"type": "string"},
            "guidelineConsiderations": {
                "type" : "array",
                "items": {
                    "type"      : "object",
                    "properties": {
                        "point"   : {"type": "string"},
                        "citation": {"type": "string"},
                    },
                    "required"            : ["point", "citation"],
                    "additionalProperties": False,
                },
            },
            "medicationFlags": {
                "type" : "array",
                "items": {
                    "type"      : "object",
                    "properties": {
                        "drug"    : {"type": "string"},
                        "flag"    : {"type": "string"},
                        "citation": {"type": "string"},
                    },
                    "required"            : ["drug", "flag", "citation"],
                    "additionalProperties": False,
                },
            },
            "retrievalStatus": {
                "type": "string",
                "enum": ["grounded", "partial", "no_relevant_content"],
            },
            "confidenceNote": {"type": "string"},
        },
        "required": [
            "interviewClinicalSummary", "retrievalAndMedicationSummary",
            "recommendedSpecialty", "specialtyReasoning",
            "guidelineConsiderations", "medicationFlags",
            "retrievalStatus", "confidenceNote",
        ],
        "additionalProperties": False,
    },
}


# ── PATIENT SUMMARY ───────────────────────────────────────────────────────────

PATIENT_SUMMARY_PROMPT = (
    "You are a medical intake assistant writing a plain-language summary for the PATIENT "
    "to read before they see the doctor. This is NOT for the clinician.\n"
    "\n"
    "You receive: (1) the corrected patient transcript, (2) verified clinical entities, "
    "(3) reference chunks from medical textbooks and guidelines, "
    "(4) medication information from drug labels (may be empty), "
    "(5) top probable conditions from our diagnostic module — these are symptom-pattern "
    "matches, not confirmed diagnoses. Use them to gently inform the patient of what "
    "the doctor may consider, without alarming them.\n"
    "\n"
    "You have FOUR jobs:\n"
    "\n"
    "JOB 1 — PATIENT COMPLAINT SUMMARY. In 2-3 plain sentences, summarise what the "
    "patient described using everyday language. Do NOT diagnose or speculate.\n"
    "\n"
    "JOB 2 — REFERRAL SPECIALTY. State the single specialty the patient is most likely "
    "to be referred to. One word or short phrase only.\n"
    "\n"
    "JOB 3 — APPOINTMENT GUIDANCE. In 2-4 bullet points, based ONLY on retrieved "
    "reference material, explain what typically happens next — what the doctor might ask, "
    "check, or watch for. Attribute to a source name. Empty array if nothing retrieved.\n"
    "\n"
    "JOB 4 — MEDICATION NOTES. For each patient medication, one plain-language sentence "
    "about what it is used for and any important label notes. Use openFDA data. "
    "Empty array if no medications reported.\n"
    "\n"
    "TONE: warm, clear, non-alarmist. Never say 'you have X'. Say 'the doctor may want "
    "to check whether...' Never invent facts. Never contradict retrieved content. "
    "Return only the JSON object the schema requires — no extra text."
)

PATIENT_SUMMARY_SCHEMA = {
    "name"  : "patient_summary",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "patientComplaintSummary": {"type": "string"},
            "referralSpecialty"      : {"type": "string"},
            "appointmentGuidance": {
                "type" : "array",
                "items": {
                    "type"      : "object",
                    "properties": {
                        "point" : {"type": "string"},
                        "source": {"type": "string"},
                    },
                    "required"            : ["point", "source"],
                    "additionalProperties": False,
                },
            },
            "medicationNotes": {
                "type" : "array",
                "items": {
                    "type"      : "object",
                    "properties": {
                        "drug": {"type": "string"},
                        "note": {"type": "string"},
                    },
                    "required"            : ["drug", "note"],
                    "additionalProperties": False,
                },
            },
        },
        "required"            : ["patientComplaintSummary", "referralSpecialty", "appointmentGuidance", "medicationNotes"],
        "additionalProperties": False,
    },
}

# Legacy aliases
DIAGNOSE_PROMPT = DOCTOR_REPORT_PROMPT
DIAGNOSE_SCHEMA = DOCTOR_REPORT_SCHEMA
