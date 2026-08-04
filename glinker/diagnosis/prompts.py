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


# ── COMBINED REPORT (doctor + patient + interpreted diagnoses — single LLM call) ─

COMBINED_REPORT_PROMPT = (
    "You generate a single structured report from one patient intake. The report has "
    "THREE sections produced in one pass: a DOCTOR section, a PATIENT section, and "
    "an INTERPRETED DIAGNOSES section.\n"
    "\n"
    "INPUTS you receive:\n"
    "  (1) Patient transcript\n"
    "  (2) Verified clinical entities (GLiNER + LLM verified — trust these)\n"
    "  (3) Reference chunks from medical textbooks and clinical guidelines\n"
    "  (4) Medication information from openFDA drug labels (may be empty)\n"
    "  (5) TF-IDF diagnostic candidates with normalized confidence scores "
    "(top = 100). These are raw symptom-vocabulary matches — a high score means "
    "the disease entry shares similar words, NOT that it is clinically likely.\n"
    "\n"
    "━━━ SECTION A — DOCTOR REPORT (clinical language, for the clinician) ━━━\n"
    "\n"
    "A1 — INTERVIEW CLINICAL SUMMARY. 2-3 sentences: chief complaint, symptom "
    "features (site, character, severity, duration, onset), associated symptoms, "
    "relevant medications and allergies. The doctor's quick-read of the case.\n"
    "\n"
    "A2 — RETRIEVAL AND MEDICATION SUMMARY. 1-2 sentences: what the retrieved "
    "reference material covers and what openFDA returned. State if nothing retrieved.\n"
    "\n"
    "A3 — RECOMMENDED SPECIALTY. Single specialty for referral, grounded in "
    "retrieved material and verified entities.\n"
    "\n"
    "A4 — SPECIALTY REASONING. 1-2 sentences explaining the referral decision, "
    "referencing retrieved material and/or plausible diagnostic candidates.\n"
    "\n"
    "A5 — GUIDELINE CONSIDERATIONS. 2-5 points from retrieved reference material "
    "relevant to this symptom pattern. Each must cite its source. Frame as "
    "'the reference states...' — not your own judgment. Empty array if nothing relevant.\n"
    "\n"
    "A6 — MEDICATION FLAGS. For each patient medication, surface relevant "
    "indications, contraindications, interactions, or dosage notes from openFDA. "
    "Each flag must cite its source. Empty array if no medications or no drug data.\n"
    "\n"
    "A7 — RETRIEVAL STATUS is pre-computed by the pipeline and provided in the input "
    "as \"retrievalStatus\". Do NOT output this field — use it only to calibrate your "
    "language: if 'grounded' cite retrieved material explicitly; if 'partial' note limited "
    "coverage; if 'no_relevant_content' state clearly that no reference material was "
    "retrieved and the recommendation is based on symptoms alone.\n"
    "\n"
    "A8 — CONFIDENCE NOTE. State which diagnostic candidates are plausible given the "
    "verified entities, which are implausible and why, and the overall confidence basis.\n"
    "\n"
    "━━━ SECTION B — PATIENT SUMMARY (plain language, for the patient) ━━━\n"
    "\n"
    "B1 — PATIENT COMPLAINT SUMMARY. 2-3 plain sentences summarising what the "
    "patient described. No diagnosis, no speculation. Everyday language only.\n"
    "\n"
    "B2 — REFERRAL SPECIALTY. One word or short phrase — the specialty most likely "
    "to see this patient.\n"
    "\n"
    "B3 — APPOINTMENT GUIDANCE. 2-4 bullet points from retrieved reference material "
    "only — what the doctor may ask, check, or watch for. Attribute each to a source "
    "name. Empty array if nothing retrieved.\n"
    "\n"
    "B4 — MEDICATION NOTES. One plain-language sentence per patient medication: "
    "what it is used for and any important label note. Use openFDA data. "
    "Empty array if no medications reported.\n"
    "\n"
    "PATIENT TONE: warm, clear, non-alarmist. Never say 'you have X'. Say "
    "'the doctor may want to check whether...'\n"
    "\n"
    "━━━ SECTION C — INTERPRETED DIAGNOSES (shared by doctor and patient dashboards) ━━━\n"
    "\n"
    "For EVERY TF-IDF candidate supplied, produce one entry. Evaluate each against "
    "the verified entities and clinical picture:\n"
    "  'likely'   — consistent with 2+ verified symptoms; clinically coherent\n"
    "  'possible' — partially consistent; worth investigating\n"
    "  'unlikely' — inconsistent with the clinical picture (include for doctor "
    "               transparency — do NOT surface to the patient)\n"
    "\n"
    "For each entry write:\n"
    "  clinicalReason — 1 sentence for the doctor explaining the plausibility verdict\n"
    "  patientNote    — 1 plain-language sentence for the patient "
    "('The doctor may want to check whether...'). Set to empty string '' if "
    "plausibility is 'unlikely' — the patient should never see implausible candidates.\n"
    "\n"
    "RULES (all sections): Every claim from retrieved content MUST include a "
    "citation. Never fabricate. Never diagnose. "
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
                    "confidenceNote": {"type": "string"},
                },
                "required": [
                    "interviewClinicalSummary", "retrievalAndMedicationSummary",
                    "recommendedSpecialty", "specialtyReasoning",
                    "guidelineConsiderations", "medicationFlags",
                    "confidenceNote",
                ],
                "additionalProperties": False,
            },
            "patientSummary": {
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
