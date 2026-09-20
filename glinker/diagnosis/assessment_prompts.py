# ==============================================================================
# glinker/diagnosis/assessment_prompts.py
#
# Call 1 of 3 in the refactored pipeline.
# Performs clinical reasoning only — no doctor/patient report wording yet.
# ==============================================================================
import json

ASSESSMENT_PROMPT = (
    "You receive structured clinical data from a completed patient intake and perform "
    "ONLY clinical reasoning — no patient-facing report wording yet.\n"
    "\n"
    "THREE jobs:\n"
    "\n"
    "JOB 1 — EVALUATE DISEASE CANDIDATES\n"
    "You receive semantic search candidates from an HPO + ICD-10 knowledge base, "
    "plus reference material from medical textbooks and clinical guidelines.\n"
    "Evaluate each candidate against the verified entities:\n"
    "  'likely'   — primary symptoms present AND presentation clinically coherent\n"
    "  'possible' — at least one verified symptom overlaps; worth clinical investigation\n"
    "  'unlikely' — vocabulary match only; inconsistent with the overall symptom picture\n"
    "\n"
    "If fewer than 2 candidates rate 'likely' or 'possible', independently generate "
    "up to 3 additional conditions that are clinically consistent with the verified entities. "
    "Mark each 'likely' or 'possible'. Prefer common, well-established diagnoses — "
    "never fabricate rare or exotic conditions.\n"
    "\n"
    "For each entry (retrieved OR self-generated):\n"
    "  disease        — condition name\n"
    "  icdCode        — ICD-10-CM code. For retrieved candidates: use the code shown in the "
    "candidate data. For self-generated: use the correct code if certain; empty string otherwise.\n"
    "  plausibility   — 'likely', 'possible', or 'unlikely'\n"
    "  clinicalReason — 1 sentence for the clinician explaining which verified symptoms "
    "support or argue against this diagnosis\n"
    "  patientNote    — 1–2 plain-language sentences describing what this condition IS "
    "(what it is, what it does to the body). Empty string when plausibility is 'unlikely'.\n"
    "\n"
    "Never diagnose. Never fabricate diseases.\n"
    "\n"
    "JOB 2 — MEDICATION FLAGS\n"
    "You receive trimmed medication label data (contraindications, warnings, drug interactions, "
    "and adverse reactions only). For each medication, write one clinical sentence that "
    "cross-checks that drug's safety data against THIS patient's specific presenting complaint "
    "and verified entities — not a generic summary. Focus on: does this medication mask, "
    "worsen, or contraindicate anything relevant to what this patient is describing right now?\n"
    "Output as medicationFlags[]: [{drug, flag}]. Empty array [] if no medications.\n"
    "\n"
    "JOB 3 — EMERGENCY ASSESSMENT\n"
    "After evaluating diagnoses, independently assess whether any 'likely' diagnosis "
    "represents a medical emergency requiring immediate care (e.g. stroke, myocardial "
    "infarction, subarachnoid haemorrhage, aortic dissection, pulmonary embolism, "
    "sepsis, anaphylaxis, meningitis).\n"
    "  triggered — true if yes, false otherwise\n"
    "  reason    — 1 short clinical sentence naming the emergency and why it is urgent "
    "(empty string when triggered is false)\n"
    "  message   — 1 plain-language sentence the patient can read telling them to seek "
    "immediate care (empty string when triggered is false)\n"
    "\n"
    "Return only the JSON the schema requires — no extra text."
)

ASSESSMENT_SCHEMA = {
    "name"  : "diagnosis_assessment",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "interpretedDiagnoses": {
                "type" : "array",
                "items": {
                    "type"      : "object",
                    "properties": {
                        "disease"       : {"type": "string"},
                        "icdCode"       : {"type": "string"},
                        "plausibility"  : {
                            "type": "string",
                            "enum": ["likely", "possible", "unlikely"],
                        },
                        "clinicalReason": {"type": "string"},
                        "patientNote"   : {"type": "string"},
                    },
                    "required"            : ["disease", "icdCode", "plausibility",
                                             "clinicalReason", "patientNote"],
                    "additionalProperties": False,
                },
            },
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
            "emergencyWarning": {
                "type"      : "object",
                "properties": {
                    "triggered": {"type": "boolean"},
                    "reason"   : {"type": "string"},
                    "message"  : {"type": "string"},
                },
                "required"            : ["triggered", "reason", "message"],
                "additionalProperties": False,
            },
        },
        "required"            : ["interpretedDiagnoses", "medicationFlags", "emergencyWarning"],
        "additionalProperties": False,
    },
}

ASSESSMENT_FEWSHOT = [
    # ── Example 1: Migraine — plausibility mix, medication flag, no emergency ──

    {
        "role": "user",
        "content": json.dumps({
            "transcript": (
                "I've had a bad headache since yesterday. Right side, throbbing. "
                "Bright light makes it much worse. A little nausea but no vomiting. "
                "I take Losartan 50mg once a day for blood pressure."
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
                "accompanied by nausea, photophobia, and phonophobia."
            ),
            "medicationInfo": (
                "Drug: Losartan (Source: openFDA)\n"
                "  [Contraindications]: Do not use in patients with hypersensitivity "
                "to losartan or any component of the formulation.\n"
                "  [Warnings And Precautions]: May cause symptomatic hypotension. "
                "Monitor renal function periodically.\n"
                "  [Drug Interactions]: NSAIDs may attenuate the antihypertensive "
                "effect and increase risk of renal impairment.\n"
                "  [Adverse Reactions]: Dizziness, upper respiratory infection, "
                "back pain, hypotension."
            ),
            "diagnosticCandidates": (
                "Semantic search retrieved the following disease candidates from the "
                "HPO + ICD-10 knowledge base:\n\n"
                "Candidate 1 [G43.9] (similarity 81.2%):\n"
                "Disease: Migraine. ICD-10 code: G43.9. "
                "Symptoms (very frequent: Headache; frequent: Nausea, Photophobia; "
                "occasional: Vomiting, Phonophobia).\n\n"
                "Candidate 2 [R51] (similarity 64.5%):\n"
                "Disease: Headache (unspecified). ICD-10 code: R51. "
                "Symptoms (very frequent: Headache)."
            ),
        }),
    },
    {
        "role": "assistant",
        "content": json.dumps({
            "interpretedDiagnoses": [
                {
                    "disease"       : "Migraine",
                    "icdCode"       : "G43.9",
                    "plausibility"  : "likely",
                    "clinicalReason": (
                        "Unilateral right-sided throbbing headache with nausea and "
                        "photophobia (bright light trigger) satisfies the hallmark triad "
                        "of migraine; all verified symptoms are consistent."
                    ),
                    "patientNote"   : (
                        "Migraine is a neurological condition that causes intense, often "
                        "one-sided headaches accompanied by nausea and sensitivity to light "
                        "or sound. It is not dangerous but can be very disabling."
                    ),
                },
                {
                    "disease"       : "Headache (unspecified)",
                    "icdCode"       : "R51",
                    "plausibility"  : "unlikely",
                    "clinicalReason": (
                        "R51 is a non-specific symptom code; the specific combination of "
                        "unilateral throbbing pain, photophobia, and nausea points "
                        "to migraine rather than an undifferentiated headache."
                    ),
                    "patientNote"   : "",
                },
                {
                    "disease"       : "Hypertensive headache",
                    "icdCode"       : "G44.309",
                    "plausibility"  : "possible",
                    "clinicalReason": (
                        "Known hypertension on Losartan is present; uncontrolled blood "
                        "pressure can precipitate headache, though the throbbing quality "
                        "and photophobia favour migraine as the primary aetiology."
                    ),
                    "patientNote"   : (
                        "Hypertensive headache occurs when blood pressure rises high enough "
                        "to cause head pain, usually felt as a dull ache at the back of the head."
                    ),
                },
            ],
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
            "emergencyWarning": {
                "triggered": False,
                "reason"   : "",
                "message"  : "",
            },
        }),
    },

    # ── Example 2: Thunderclap headache — subarachnoid haemorrhage, emergency fires ──

    {
        "role": "user",
        "content": json.dumps({
            "transcript": (
                "This morning I got the worst headache of my life, absolutely sudden, "
                "10 out of 10. My neck feels stiff and I vomited twice."
            ),
            "verifiedEntities": [
                {"category": "symptom",  "keyword": "sudden severe headache", "relates_to": ""},
                {"category": "severity", "keyword": "10 out of 10",           "relates_to": "sudden severe headache"},
                {"category": "onset",    "keyword": "this morning",           "relates_to": "sudden severe headache"},
                {"category": "symptom",  "keyword": "neck stiffness",         "relates_to": ""},
                {"category": "symptom",  "keyword": "vomiting",               "relates_to": ""},
            ],
            "retrievedChunks": (
                "[Source: textbook_2891 | Subarachnoid Haemorrhage | Score: 0.82]\n"
                "Subarachnoid haemorrhage (SAH) classically presents with a sudden-onset "
                "'thunderclap' headache described as the worst headache of the patient's "
                "life, often accompanied by neck stiffness, photophobia, and vomiting. "
                "Immediate non-contrast CT head followed by lumbar puncture if CT is "
                "negative is the diagnostic standard. SAH carries high mortality if "
                "diagnosis is delayed."
            ),
            "medicationInfo": "No medication label data provided.",
            "diagnosticCandidates": (
                "Semantic search retrieved the following disease candidates from the "
                "HPO + ICD-10 knowledge base:\n\n"
                "Candidate 1 [I60.9] (similarity 78.4%):\n"
                "Disease: Subarachnoid Haemorrhage. ICD-10 code: I60.9. "
                "Symptoms (very frequent: Headache, Neck stiffness; "
                "frequent: Vomiting, Photophobia, Loss of consciousness)."
            ),
        }),
    },
    {
        "role": "assistant",
        "content": json.dumps({
            "interpretedDiagnoses": [
                {
                    "disease"       : "Subarachnoid haemorrhage",
                    "icdCode"       : "I60.9",
                    "plausibility"  : "likely",
                    "clinicalReason": (
                        "Sudden maximal-severity ('thunderclap') headache at onset, "
                        "neck stiffness, and vomiting constitute the classic triad of "
                        "subarachnoid haemorrhage — this presentation mandates immediate "
                        "emergency assessment."
                    ),
                    "patientNote"   : (
                        "Subarachnoid haemorrhage is bleeding around the surface of the "
                        "brain, caused by a burst blood vessel. It causes a sudden, "
                        "extremely severe headache and is a medical emergency."
                    ),
                },
            ],
            "medicationFlags": [],
            "emergencyWarning": {
                "triggered": True,
                "reason"   : (
                    "Subarachnoid haemorrhage (I60.9) is likely — sudden maximal-severity "
                    "headache with neck stiffness and vomiting requires immediate CT head "
                    "and neurosurgical evaluation; delay significantly worsens prognosis."
                ),
                "message"  : (
                    "Please call emergency services (999/911) right away — this type of "
                    "sudden severe headache can be a sign of bleeding around the brain "
                    "and needs immediate hospital care."
                ),
            },
        }),
    },
]
