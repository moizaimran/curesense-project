# ==============================================================================
# glinker/diagnosis/doctor_report_prompts.py
#
# Call 2 of 3 in the refactored pipeline.
# Generates only the two free-text fields that require new writing for the
# clinician report. Medication flags and diagnoses come from Call 1.
# ==============================================================================
import json

DOCTOR_REPORT_PROMPT = (
    "You receive a completed patient intake and produce exactly two clinical summaries "
    "for a clinician audience. Nothing else.\n"
    "\n"
    "JOB 1 — PATIENT COMPLAINT SUMMARY\n"
    "Write 2–3 sentences summarising what the patient presented with: chief complaint, "
    "site, character, duration, severity, associated symptoms, relevant medications, "
    "and any allergies. Use clear clinical language. No diagnosis, no speculation, no "
    "interpretation — only what the patient described. Ground every statement in the "
    "verified entities and transcript provided.\n"
    "Put in \"patientComplaintSummary\".\n"
    "\n"
    "JOB 2 — RAG SUMMARY\n"
    "Write 2–3 sentences synthesising what the retrieved reference material (textbooks "
    "and clinical guidelines) says that is directly relevant to THIS patient's symptom "
    "pattern. Attribute to the specific source names shown in the chunks. If the retrieved "
    "material says nothing relevant, or if no material was retrieved, write exactly: "
    "'No relevant reference material was found for this symptom pattern.'\n"
    "Put in \"ragSummary\".\n"
    "\n"
    "Return only the JSON the schema requires — no extra text."
)

DOCTOR_REPORT_SCHEMA = {
    "name"  : "doctor_report",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "patientComplaintSummary": {"type": "string"},
            "ragSummary"             : {"type": "string"},
        },
        "required"            : ["patientComplaintSummary", "ragSummary"],
        "additionalProperties": False,
    },
}

DOCTOR_REPORT_FEWSHOT = [
    {
        "role": "user",
        "content": json.dumps({
            "transcript": (
                "I've had a bad headache since yesterday. Right side, throbbing. "
                "Bright light makes it much worse. A little nausea but no vomiting. "
                "I take Losartan 50mg once a day for blood pressure. No allergies."
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
                {"category": "frequency",         "keyword": "once a day",      "relates_to": "Losartan"},
                {"category": "medical condition", "keyword": "blood pressure",  "relates_to": ""},
            ],
            "retrievedChunks": (
                "[Source: textbook_1042 | Migraine | Score: 0.71]\n"
                "Migraine is a primary headache disorder characterised by recurrent "
                "attacks of moderate to severe unilateral throbbing pain, often "
                "accompanied by nausea, photophobia, and phonophobia. "
                "First-line acute treatment includes triptans and NSAIDs; "
                "preventive therapy is indicated for frequent attacks."
            ),
        }),
    },
    {
        "role": "assistant",
        "content": json.dumps({
            "patientComplaintSummary": (
                "The patient presents with a right-sided throbbing headache that began "
                "approximately one day ago, accompanied by nausea and photophobia "
                "triggered by bright light, with no vomiting reported. They take Losartan "
                "50mg once daily for hypertension and have no known allergies."
            ),
            "ragSummary": (
                "textbook_1042 describes migraine as a primary headache disorder "
                "presenting with recurrent unilateral throbbing pain frequently accompanied "
                "by nausea and photophobia — directly matching this patient's presentation. "
                "The source notes triptans and NSAIDs as first-line acute treatment, with "
                "preventive therapy indicated for frequent attacks."
            ),
        }),
    },
]
