# ==============================================================================
# glinker/diagnosis/prompts.py
#
# Prompts, JSON schemas, and few-shot examples for the post-interview LLM calls:
#   • finalize       — verify entities, build ragQuery, pass through rankedDiseases
#   • doctor_report  — doctor-facing grounded report (retrieved chunks + FDA data)
#   • patient_summary — plain-language patient-facing summary
# ==============================================================================
import json

# ── FINALIZE ──────────────────────────────────────────────────────────────────

FINALIZE_PROMPT = (
    "You receive a completed patient intake transcript (already spelling-corrected) and "
    "a list of entities (category + keyword + ner_confidence 0-1) an NLP model extracted "
    "from it. You do TWO jobs in one pass, and return both as JSON:\n"
    "\n"
    "JOB 1 — VERIFY ENTITIES. Valid categories: symptom, medical condition, body part, "
    "severity, duration, medication, dosage, frequency, allergy, trigger.\n"
    "USE ner_confidence AS A PRIOR, DON'T RE-DERIVE EVERYTHING FROM SCRATCH: the NER model "
    "is usually right about WHERE a real span is (high ner_confidence, roughly >=0.6) — "
    "for those, do a quick pass/fail check against the 4 tests below rather than "
    "re-analyzing the whole sentence around them. Spend your real effort on low-confidence "
    "entities (likely wrong span or category) and on catching things ONLY you can catch "
    "that the NER model structurally can't — negation, denial, and whether something is "
    "truly a stated fact vs. inferred/asked-about — since the NER model has no idea about "
    "any of that regardless of its confidence score. A high ner_confidence never overrides "
    "tests a-d below (e.g. a high-confidence \"neck\" span still gets dropped if the "
    "patient denied it) — confidence only tells you how much re-checking of the SPAN "
    "ITSELF is needed, not whether to skip the tests.\n"
    "For EVERY entity — the ones handed to you AND any you add yourself for something the "
    "NLP model missed — keep it only if it passes ALL four tests below. If it fails even "
    "one, drop it entirely; never keep a failing entity under a different category as a "
    "fallback.\n"
    "  a. AFFIRMED, NOT DENIED — the patient is asserting this is true about them right "
    "now. Reject anything they deny, rule out, or describe as absent, in ANY phrasing "
    "however broken or informal.\n"
    "  b. CONCRETE, NOT A LABEL OR VAGUE FILLER — the keyword must name an actual specific "
    "thing the patient said. Never keep a vague hedge word when a concrete value for the "
    "SAME thing is also present — keep only the concrete one.\n"
    "  c. STATED, NOT SILENTLY GUESSED — if the patient names a reason/purpose themselves, "
    "even in plain everyday words, that IS the patient stating their condition — keep it. "
    "Only drop a condition when the patient gives NO purpose at all.\n"
    "  d. RIGHT CATEGORY FOR THE MEANING — pick the category that matches what the phrase "
    "actually IS.\n"
    "LINK MODIFIERS: every entity also needs \"relates_to\". For standalone items "
    "(symptom, medical condition, medication, allergy, trigger) set it to \"\". For "
    "modifier categories (severity, duration, dosage, frequency, body part when naming "
    "WHERE a symptom is) set it to the exact keyword of the symptom/medication it belongs "
    "to.\n"
    "\n"
    "JOB 2 — RAG QUERY. Write a dense, retrieval-optimized clinical search string for "
    "this case and put it in \"ragQuery\". NOT prose — compact clinical keyword sequence: "
    "chief complaint + anatomical site + character + duration + severity + associated "
    "features + relevant medications.\n"
    "  Good: \"right-sided throbbing headache photophobia nausea 6/10 two days "
    "losartan hypertension\"\n"
    "  Bad:  \"Patient has had a headache on the right side since yesterday.\"\n"
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
            "ragQuery"      : {"type": "string"},
            "rankedDiseases": {
                "type": "array",
                "items": {
                    "type"      : "object",
                    "properties": {
                        "disease"   : {"type": "string"},
                        "confidence": {"type": "number"},
                    },
                    "required"            : ["disease", "confidence"],
                    "additionalProperties": False,
                },
            },
        },
        "required"            : ["entities", "ragQuery", "rankedDiseases"],
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
            "rankedDiseases": [
                {"disease": "migraine",               "confidence": 100.0},
                {"disease": "cluster headache",       "confidence": 68.3},
                {"disease": "hypertensive headache",  "confidence": 54.1},
            ],
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
                {"category": "severity",          "keyword": "six",                "relates_to": "headache"},
                {"category": "medication",        "keyword": "Losartan",           "relates_to": ""},
                {"category": "dosage",            "keyword": "50 milligram",       "relates_to": "Losartan"},
                {"category": "frequency",         "keyword": "one time every day", "relates_to": "Losartan"},
                {"category": "medical condition", "keyword": "blood pressure",     "relates_to": ""},
            ],
            "ragQuery": (
                "right-sided throbbing headache photophobia nausea 6/10 two days "
                "losartan 50mg daily hypertension"
            ),
            "rankedDiseases": [
                {"disease": "migraine",               "confidence": 100.0},
                {"disease": "cluster headache",       "confidence": 68.3},
                {"disease": "hypertensive headache",  "confidence": 54.1},
            ],
        }),
    },
]


# ── DOCTOR REPORT ─────────────────────────────────────────────────────────────

DOCTOR_REPORT_PROMPT = (
    "You are a clinical decision support tool generating a doctor-facing pre-consultation "
    "report. Your output is for the CLINICIAN, not the patient — write as if briefing a "
    "doctor before they see this patient.\n"
    "\n"
    "You receive: (1) the patient transcript, (2) verified clinical entities, "
    "(3) reference chunks retrieved from medical textbooks and clinical guidelines, "
    "(4) medication information from openFDA drug labels (may be empty).\n"
    "\n"
    "You have SIX jobs:\n"
    "\n"
    "JOB 1 — INTERVIEW CLINICAL SUMMARY. In 2-3 sentences, write a concise technical "
    "summary of the clinical picture from the interview for the clinician. Cover: chief "
    "complaint, key symptom features (site, character, severity, duration, onset), "
    "associated symptoms, relevant medications and allergies. This is the doctor's "
    "quick-read of the case before the detailed findings.\n"
    "\n"
    "JOB 2 — RETRIEVAL AND MEDICATION SUMMARY. In 1-2 sentences, briefly state what the "
    "retrieved reference material covers and what openFDA returned. For example: "
    "'Retrieved 4 chunks from NICE headache guidelines covering migraine, cluster headache, "
    "and atypical aura. Ibuprofen openFDA label retrieved — GI risk and medication overuse "
    "flagged.' If nothing was retrieved or no medications exist, state that clearly.\n"
    "\n"
    "JOB 3 — RECOMMENDED SPECIALTY. Recommend the single specialty most appropriate "
    "for referral, explicitly grounded in the retrieved reference material where available.\n"
    "\n"
    "JOB 4 — GUIDELINE CONSIDERATIONS. List 2-5 relevant points the retrieved reference "
    "material associates with this symptom pattern. Each point must include a citation "
    "string naming the source. Frame as 'the guideline states...' or 'the reference "
    "material notes...' — never as your own clinical judgment. Empty array if no "
    "retrieved material is relevant.\n"
    "\n"
    "JOB 5 — MEDICATION FLAGS. For each medication the patient is taking, surface any "
    "relevant indications, contraindications, interactions, or dosage notes from the "
    "provided openFDA drug-label data. Each flag must cite its source. Empty array if "
    "no drug-label data was provided or the patient takes no medications.\n"
    "\n"
    "JOB 6 — RETRIEVAL STATUS. Set retrievalStatus to:\n"
    "  'grounded'             — retrieved material directly informed the recommendation\n"
    "  'partial'              — retrieved material is loosely related\n"
    "  'no_relevant_content'  — nothing above relevance threshold; route from symptoms only\n"
    "When 'no_relevant_content', explain in confidenceNote.\n"
    "\n"
    "RULES: Every claim from retrieved content MUST include a citation. Never fabricate. "
    "Never diagnose. Never contradict retrieved guideline text. "
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
    "(4) medication information from drug labels (may be empty).\n"
    "\n"
    "You have THREE jobs:\n"
    "\n"
    "JOB 1 — PATIENT COMPLAINT SUMMARY. In 2-3 plain sentences, summarise what the "
    "patient described using everyday language (not medical jargon). Do NOT include "
    "speculation or diagnosis.\n"
    "\n"
    "JOB 2 — REFERRAL SPECIALTY. Based on the transcript and entities provided, state "
    "the single medical specialty the patient is most likely to be referred to (e.g. "
    "'Neurology', 'Cardiology', 'General Medicine'). One word or short phrase only.\n"
    "\n"
    "JOB 3 — APPOINTMENT GUIDANCE. In 2-4 bullet points, based ONLY on the retrieved "
    "reference material, explain what typically happens next for this type of complaint — "
    "what the doctor might ask, what they might check, or what to watch for. Attribute "
    "to 'general guidance' or a source name. Omit this section (empty array) if no "
    "relevant material was retrieved.\n"
    "\n"
    "JOB 4 — MEDICATION NOTES. For each medication the patient mentioned, provide one "
    "plain-language sentence about what it is typically used for and any important notes "
    "from the drug label (e.g. 'don't take on an empty stomach'). Use the openFDA data "
    "provided. Empty array if no medications reported.\n"
    "\n"
    "TONE: warm, clear, non-alarmist. Do NOT diagnose. Do NOT say 'you have X'. "
    "Say 'the doctor may want to check whether...' or 'it's common with this type of "
    "complaint to...' Never invent facts. Never contradict retrieved content. "
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


# Keep legacy aliases so old import references don't break during transition
DIAGNOSE_PROMPT = DOCTOR_REPORT_PROMPT
DIAGNOSE_SCHEMA = DOCTOR_REPORT_SCHEMA
