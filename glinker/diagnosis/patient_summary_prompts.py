# ==============================================================================
# glinker/diagnosis/patient_summary_prompts.py
#
# Call 3 of 3 in the refactored pipeline.
# Generates patient-facing content only. Clinical decisions (diagnoses,
# medication safety) were made in Call 1 — this call rephrases them,
# never re-derives them.
# ==============================================================================
import json

PATIENT_SUMMARY_PROMPT = (
    "You receive a completed patient intake and produce five patient-facing outputs. "
    "Write for a general adult audience — warm, clear, non-alarmist, no jargon.\n"
    "\n"
    "JOB 1 — PATIENT COMPLAINT SUMMARY\n"
    "Write 2–3 warm, plain-language sentences describing what the patient told us: "
    "their main symptom, where it is, what it feels like, how long it has been going on, "
    "and anything else notable (other symptoms, medications, allergies). Avoid clinical "
    "terms — use everyday language. No diagnosis, no interpretation.\n"
    "Put in \"patientComplaintSummary\".\n"
    "\n"
    "JOB 2 — RESEARCH SUMMARY\n"
    "Write 2–3 sentences explaining what general health information was found that may "
    "relate to this patient's symptoms. Use plain, accessible language — no clinical "
    "abbreviations, no Latin. Attribute to sources by name when shown. If nothing "
    "relevant was retrieved, write exactly: "
    "'We weren't able to find specific health guidance matching your symptoms right now.'\n"
    "Put in \"researchSummary\".\n"
    "\n"
    "JOB 3 — SELF-CARE GUIDANCE\n"
    "Write 2–4 short, practical self-care points relevant to the presenting complaint. "
    "Focus on things the patient can actually do at home: rest, hydration, positioning, "
    "over-the-counter options, and — critically — when to escalate to a doctor or "
    "emergency services. Each point is one plain sentence.\n"
    "Put in \"selfCareGuidance\" as [{\"point\": \"...\"}].\n"
    "\n"
    "JOB 4 — REFERRAL SPECIALTY\n"
    "Name the single medical specialty this patient should see based on their chief "
    "complaint (e.g. 'Neurologist', 'Gastroenterologist', 'General Practitioner'). "
    "One specialty name only, no explanation.\n"
    "Put in \"referralSpecialty\".\n"
    "\n"
    "JOB 5 — MEDICATION NOTES\n"
    "You are given:\n"
    "  medicationNames  — the complete list of medications this patient is on\n"
    "  medicationFlags  — clinician-decided safety concerns (may cover only some drugs, or none)\n"
    "  medicationInfo   — label data for additional phrasing context\n"
    "\n"
    "Write one plain-language note for EVERY drug in medicationNames — no drug should "
    "be left out:\n"
    "  • If the drug has a matching entry in medicationFlags: translate that flag's "
    "concern into one warm, patient-friendly sentence. The flag is the authoritative "
    "source for WHAT to say — use the label data only for additional phrasing context.\n"
    "  • If the drug has no flag: write a brief, calm note confirming no specific concern "
    "was identified (e.g. 'No specific concerns were noted for this medication — continue "
    "taking it as prescribed.').\n"
    "CRITICAL: do NOT introduce safety concerns that are not already present in the flags.\n"
    "If medicationNames is empty, output [].\n"
    "Put in \"medicationNotes\" as [{\"drug\": \"...\", \"note\": \"...\"}].\n"
    "\n"
    "Return only the JSON the schema requires — no extra text."
)

PATIENT_SUMMARY_SCHEMA = {
    "name"  : "patient_summary",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "patientComplaintSummary": {"type": "string"},
            "researchSummary"        : {"type": "string"},
            "selfCareGuidance": {
                "type" : "array",
                "items": {
                    "type"            : "object",
                    "properties"      : {"point": {"type": "string"}},
                    "required"        : ["point"],
                    "additionalProperties": False,
                },
            },
            "referralSpecialty": {"type": "string"},
            "medicationNotes"  : {
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
        "required"            : ["patientComplaintSummary", "researchSummary",
                                 "selfCareGuidance", "referralSpecialty", "medicationNotes"],
        "additionalProperties": False,
    },
}

PATIENT_SUMMARY_FEWSHOT = [
    # Two medications: Losartan has a flag, Amitriptyline does not.
    # Demonstrates both Job 5 branches (translate-flag and no-concerns) in one example.
    {
        "role": "user",
        "content": json.dumps({
            "transcript": (
                "I've had a bad headache since yesterday. Right side, throbbing. "
                "Bright light makes it much worse. A little nausea but no vomiting. "
                "I take Losartan 50mg once a day for blood pressure, and Amitriptyline "
                "10mg at night. No allergies."
            ),
            "verifiedEntities": [
                {"category": "symptom",           "keyword": "headache",        "relates_to": ""},
                {"category": "body part",         "keyword": "right side",      "relates_to": "headache"},
                {"category": "symptom",           "keyword": "throbbing",       "relates_to": ""},
                {"category": "duration",          "keyword": "since yesterday", "relates_to": "headache"},
                {"category": "symptom",           "keyword": "nausea",          "relates_to": ""},
                {"category": "trigger",           "keyword": "bright light",    "relates_to": "headache"},
                {"category": "medication",        "keyword": "Losartan",        "relates_to": ""},
                {"category": "dosage",            "keyword": "50mg",            "relates_to": "Losartan"},
                {"category": "medication",        "keyword": "Amitriptyline",   "relates_to": ""},
                {"category": "dosage",            "keyword": "10mg",            "relates_to": "Amitriptyline"},
                {"category": "frequency",         "keyword": "at night",        "relates_to": "Amitriptyline"},
                {"category": "medical condition", "keyword": "blood pressure",  "relates_to": ""},
            ],
            "retrievedPatientChunks": (
                "[Source: wikidoc_3821 | Migraine | Score: 0.68]\n"
                "A migraine is a type of headache that usually causes a throbbing or pulsating "
                "pain on one side of the head. It is often accompanied by nausea and sensitivity "
                "to light and sound. Resting in a dark, quiet room and staying well-hydrated can "
                "help ease symptoms. Most migraines improve within a few hours to a couple of days."
            ),
            "medicationNames": ["Losartan", "Amitriptyline"],
            "medicationFlags": [
                {
                    "drug": "Losartan",
                    "flag": (
                        "NSAIDs commonly used for acute migraine (ibuprofen, naproxen) "
                        "attenuate Losartan's antihypertensive effect and increase renal "
                        "risk — prefer paracetamol or a triptan for migraine analgesia "
                        "in this patient."
                    ),
                },
            ],
            "medicationInfo": (
                "Drug: Losartan (Source: openFDA)\n"
                "  [Contraindications]: Do not use in patients with hypersensitivity to losartan.\n"
                "  [Warnings And Precautions]: May cause symptomatic hypotension.\n"
                "  [Drug Interactions]: NSAIDs may attenuate the antihypertensive effect.\n"
                "  [Adverse Reactions]: Dizziness, upper respiratory infection, back pain.\n\n"
                "Drug: Amitriptyline (Source: openFDA)\n"
                "  [Contraindications]: Do not use within 14 days of MAO inhibitors.\n"
                "  [Warnings And Precautions]: May cause drowsiness; use caution when driving.\n"
                "  [Drug Interactions]: Avoid alcohol and CNS depressants.\n"
                "  [Adverse Reactions]: Dry mouth, drowsiness, constipation, blurred vision."
            ),
        }),
    },
    {
        "role": "assistant",
        "content": json.dumps({
            "patientComplaintSummary": (
                "You told us you've had a throbbing headache on the right side of your head "
                "since yesterday, and that bright light makes it feel worse. You also mentioned "
                "some nausea, though no vomiting. You take Losartan and Amitriptyline daily "
                "and have no known allergies."
            ),
            "researchSummary": (
                "Health information from wikidoc describes this type of one-sided throbbing "
                "headache — often with nausea and light sensitivity — as a pattern commonly "
                "associated with migraine. The guidance notes that resting in a dark, quiet "
                "room and staying hydrated can help ease symptoms, and that most episodes "
                "improve within a few hours to a couple of days."
            ),
            "selfCareGuidance": [
                {"point": "Rest in a dark, quiet room — light and noise can make this type of headache significantly worse."},
                {"point": "Stay well-hydrated and avoid skipping meals, as dehydration and low blood sugar can worsen headache pain."},
                {"point": "For pain relief, paracetamol is a safe option — avoid ibuprofen or naproxen while taking Losartan."},
                {"point": "Seek emergency care immediately if the headache suddenly becomes much worse, or if you develop a stiff neck, fever, vision changes, or weakness."},
            ],
            "referralSpecialty": "Neurologist",
            "medicationNotes": [
                {
                    "drug": "Losartan",
                    "note": (
                        "If you need something for the headache pain, stick to paracetamol — "
                        "common painkillers like ibuprofen or naproxen can make your blood "
                        "pressure medication less effective."
                    ),
                },
                {
                    "drug": "Amitriptyline",
                    "note": (
                        "No specific concerns were noted for Amitriptyline in relation to "
                        "your current symptoms — continue taking it as prescribed."
                    ),
                },
            ],
        }),
    },
]
