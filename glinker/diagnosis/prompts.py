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
    "JOB 4 — SESSION NAME. Generate a concise 2-5 word memorable clinical name for this "
    "interview session that captures the main complaint clearly. Put in \"sessionName\".\n"
    "  Good: \"Recurring Migraine with Nausea\", \"Acute Fever and Body Aches\", "
    "\"Left Knee Pain with Stiffness\", \"Chest Tightness on Exertion\"\n"
    "  Bad:  \"Headache\", \"Patient Interview Session\", \"Medical Consultation\"\n"
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
            "sessionName"    : {"type": "string"},
        },
        "required"            : ["entities", "ragQuery", "diagnosticQuery", "sessionName"],
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
            "sessionName": "Right-Sided Throbbing Headache",
        }),
    },
]


# ── COMBINED REPORT (doctor + patient + interpreted diagnoses — single LLM call) ─

COMBINED_REPORT_PROMPT = (
    "You generate a structured report from one patient intake in one pass. "
    "THREE sections: DOCTOR, PATIENT, and INTERPRETED DIAGNOSES.\n"
    "\n"
    "INPUTS you receive:\n"
    "  (1) Patient transcript\n"
    "  (2) Verified clinical entities (GLiNER + LLM verified — trust these)\n"
    "  (3) Reference chunks from medical textbooks and clinical guidelines\n"
    "  (4) Medication information from openFDA drug labels (may be empty)\n"
    "  (5) TF-IDF diagnostic candidates with normalized confidence scores "
    "(top = 100). High score = vocabulary match only, NOT clinical certainty.\n"
    "\n"
    "━━━ SECTION A — DOCTOR REPORT ━━━\n"
    "\n"
    "A1 — PATIENT COMPLAINT SUMMARY. 2-3 sentences summarising what the patient "
    "described: chief complaint, site, character, severity, duration, associated "
    "symptoms, medications, allergies. Write in clear, plain language that both a "
    "clinician and an educated patient could read and understand — accurate but not "
    "full of jargon. No diagnosis, no speculation. Put in \"patientComplaintSummary\".\n"
    "\n"
    "A2 — RAG SUMMARY. 2-3 sentences summarising what the retrieved reference "
    "material says that is relevant to this patient's symptoms. Write clearly — "
    "accurate enough for a clinician, understandable enough for an educated patient. "
    "Do not cite inline here; summarise the key points. If nothing was retrieved, "
    "state: 'No relevant reference material was found for this symptom pattern.' "
    "Put in \"ragSummary\".\n"
    "\n"
    "━━━ SECTION B — PATIENT SUMMARY ━━━\n"
    "\n"
    "B1 — PATIENT COMPLAINT SUMMARY. Copy the exact same text from A1 word for word "
    "into \"patientComplaintSummary\".\n"
    "\n"
    "B2 — RAG SUMMARY. Copy the exact same text from A2 word for word "
    "into \"ragSummary\".\n"
    "\n"
    "B3 — MEDICATION FLAGS. For each medication the patient reported, write one "
    "plain-language sentence with the single most important safety point they should "
    "know (e.g. what to avoid, a key interaction, when to call a doctor). Use openFDA "
    "data when available; use accurate clinical knowledge otherwise. Warm, non-alarmist "
    "tone. Empty array [] if no medications reported. Put in \"medicationFlags\" as "
    "[{\"drug\": \"...\", \"flag\": \"...\"}].\n"
    "\n"
    "B4 — APPOINTMENT GUIDANCE. 2-4 bullet points from retrieved reference material "
    "only — what the doctor may ask, check, or watch for at the appointment. Attribute "
    "each to a source name. Empty array [] if nothing was retrieved. Put in "
    "\"appointmentGuidance\" as [{\"point\": \"...\", \"source\": \"...\"}].\n"
    "\n"
    "━━━ SECTION C — INTERPRETED DIAGNOSES ━━━\n"
    "\n"
    "You are given semantic search candidates retrieved from a medical knowledge base "
    "(HPO symptom ontology + ICD-10 + MedlinePlus). Each candidate includes the "
    "disease name, ICD-10 code, symptom frequency data, and a plain-language description.\n"
    "\n"
    "STEP 1 — Evaluate each supplied candidate against the verified entities:\n"
    "  'likely'   — primary symptoms are present AND clinically coherent with this disease\n"
    "  'possible' — at least one verified symptom overlaps; worth clinical investigation\n"
    "  'unlikely' — retrieved by vocabulary match only; inconsistent with the overall picture\n"
    "\n"
    "STEP 2 — If fewer than 2 candidates are rated 'likely' or 'possible' after step 1, "
    "independently generate up to 3 additional conditions that ARE clinically consistent "
    "with the verified entities. Mark these 'likely' or 'possible' as appropriate. "
    "Base these on your clinical knowledge — do not fabricate rare exotic conditions; "
    "prefer common, well-established diagnoses that fit the symptom pattern.\n"
    "\n"
    "For each entry (supplied OR self-generated):\n"
    "  clinicalReason — 1 sentence for the doctor explaining the verdict\n"
    "  patientNote    — 1-2 plain-language sentences describing what this condition IS "
    "(what it is, what it does to the body). Set to '' if plausibility is 'unlikely'.\n"
    "\n"
    "Never diagnose. Never fabricate diseases. "
    "Return only the JSON object the schema requires — no extra text."
)

COMBINED_REPORT_SCHEMA = {
    "name"  : "combined_report",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "doctorReport": {
                "type": "object",
                "properties": {
                    "patientComplaintSummary": {"type": "string"},
                    "ragSummary"             : {"type": "string"},
                },
                "required"            : ["patientComplaintSummary", "ragSummary"],
                "additionalProperties": False,
            },
            "patientSummary": {
                "type": "object",
                "properties": {
                    "patientComplaintSummary": {"type": "string"},
                    "ragSummary"             : {"type": "string"},
                    "medicationFlags": {
                        "type" : "array",
                        "items": {
                            "type"      : "object",
                            "properties": {
                                "drug": {"type": "string"},
                                "flag": {"type": "string"},
                            },
                            "required"            : ["drug", "flag"],
                            "additionalProperties": False,
                        },
                    },
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
                },
                "required"            : ["patientComplaintSummary", "ragSummary", "medicationFlags", "appointmentGuidance"],
                "additionalProperties": False,
            },
            "interpretedDiagnoses": {
                "type" : "array",
                "items": {
                    "type"      : "object",
                    "properties": {
                        "disease"       : {"type": "string"},
                        "plausibility"  : {
                            "type": "string",
                            "enum": ["likely", "possible", "unlikely"],
                        },
                        "clinicalReason": {"type": "string"},
                        "patientNote"   : {"type": "string"},
                    },
                    "required"            : ["disease", "plausibility", "clinicalReason", "patientNote"],
                    "additionalProperties": False,
                },
            },
        },
        "required"            : ["doctorReport", "patientSummary", "interpretedDiagnoses"],
        "additionalProperties": False,
    },
}

# Legacy aliases
DOCTOR_REPORT_PROMPT = COMBINED_REPORT_PROMPT
DOCTOR_REPORT_SCHEMA = COMBINED_REPORT_SCHEMA
PATIENT_SUMMARY_PROMPT = COMBINED_REPORT_PROMPT
PATIENT_SUMMARY_SCHEMA = COMBINED_REPORT_SCHEMA
DIAGNOSE_PROMPT = COMBINED_REPORT_PROMPT
DIAGNOSE_SCHEMA = COMBINED_REPORT_SCHEMA
