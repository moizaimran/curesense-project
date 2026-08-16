# CureSense — AI Module Progress

---

## Models & Parameters

**LLM**
- Model: `gpt-5.6-luna` (reasoning model, lighter/cheaper than GPT-4 class)
- `reasoning_effort: low` — minimal hidden reasoning tokens (billed same as output)
- Token limits: interview turns 500 · finalize 1200 · combined report 1500
- Structured outputs enforced via `response_format: json_schema, strict: True` on every call

**GLiNER — Medical NER**
- Model: `Ihor/gliner-biomed-bi-large-v1.0` on CUDA
- 10 labels: symptom, medical condition, body part, severity, duration, medication, dosage, frequency, allergy, trigger
- Threshold: 0.4 confidence · runs once after interview completes

**Embedding (RAG)**
- Model: `BAAI/bge-small-en-v1.5` (local, GPU, free — zero OpenAI cost)
- Dim: 384 · L2-normalised vectors · FAISS IndexFlatIP

**Speech-to-Text**
- Model: `openai/whisper-large` on CUDA
- `task="translate"` — any language → English directly
- Runs only on voice turns, before LLM spelling-correction pass

---

## Knowledge Base (RAG)

- **Sources:** `MedRAG/textbooks` (5,000 entries) + `epfl-llm/guidelines` (2,000 entries)
- **Chunking:** 600 tokens / 100 overlap at sentence boundaries
- **Index:** FAISS `IndexFlatIP` · 44,231 vectors · cosine similarity
- **Threshold:** 0.45 similarity score to include a chunk
- **Medications:** NOT in vector DB — fetched live from openFDA API per drug per visit
- **Saved as:** `uresense-rag-index` Kaggle dataset (skip rebuild on next session)

---

## Disease Ranking Module

- **Method:** TF-IDF (`max_features=30,000`, `ngram_range=(1,3)`, `sublinear_tf=True`)
- **Data:** 9 Kaggle symptom-disease CSVs · 359,632 rows · 2,127 unique diseases
- **Input:** LLM-generated `diagnosticQuery` (symptom-only plain terms, no meds/conditions)
  plus verified symptom/body-part/trigger/severity/duration entity keywords
- **Scoring:** 60% TF-IDF cosine similarity + 40% symptom keyword overlap
  (overlap = fraction of patient's verified symptom keywords found in disease's dataset entry)
- **Output:** top-5 ranked diseases with confidence scores (normalized to 100)
- **Query split:** `diagnosticQuery` for TF-IDF · `ragQuery` (dense clinical terms incl. meds) for FAISS

---

## System Architecture

```
React Frontend
      ↓
Express / Node.js  (port 5000, Backend/)
      ↓                    ↓
MongoDB Atlas         Flask + Ngrok  (Kaggle T4 GPU, CureSense_AI_Modules/)
                      stateless microservice — no DB access
```

Flask is **stateless** — Express sends full context on every request. Flask never writes to DB.

---

## Complete Pipeline Flow (with responsible files)

### INTERVIEW PHASE

```
Patient types or speaks
        ↓
[Voice only] glinker/interview/session.py — Whisper transcribes audio → English text
        ↓
POST /interview/turn  (api/app.py)
        ↓
glinker/interview/session.py → run_interview_turn()
  · Builds full message list: [system prompt + few-shots + live history]
  · System prompt: INTERVIEW_PROMPT (glinker/interview/prompts.py)
    - SOCRATES framework: Site, Onset, Character, Radiation, Associations,
      Time/duration, Exacerbating/relieving, Severity
    - Also covers medications and allergies
    - STOP EARLY: only complete after ALL 8 SOCRATES dimensions + meds + allergies answered
  · Returns: { status: "continue"|"complete", message, correctedPatientText }
        ↓
Express (Backend/controllers/sessionController.js)
  · Saves turn to session.transcript[]
  · If voice: audio uploaded to Cloudinary first, URL sent to Flask
  · Repeats until status = "complete"
```

---

### FINALIZE PHASE (triggered once on status:"complete")

```
Express sends joined correctedPatientText → POST /pipeline/finalize (api/app.py)
```

**Step 1 — GLiNER NER** `glinker/diagnosis/finalize.py → run_gliner()`
- Runs GLiNER biomedical model on full transcript
- Extracts raw entities: text, category, confidence score, character positions
- Deduplicates by (text, label) pair

**Step 2 — LLM Finalize** `glinker/diagnosis/finalize.py → finalize_report()`
- Schema: `FINALIZE_SCHEMA` · Prompt: `FINALIZE_PROMPT` (`glinker/diagnosis/prompts.py`)
- 3 jobs in one LLM call:
  - JOB 1: Verify/clean GLiNER entities (affirmed? concrete? right category? links modifiers)
  - JOB 2: Write `ragQuery` — dense clinical keywords including meds, for FAISS vector search
  - JOB 3: Write `diagnosticQuery` — symptom-only plain terms, NO meds/conditions, for TF-IDF
- Returns: `{ entities[], ragQuery, diagnosticQuery }`

**Step 3 — RAG Retrieval** `glinker/rag/retrieval.py → retrieve_context()`
- Embeds `ragQuery` using BAAI/bge-small-en-v1.5
- Searches FAISS index (44,231 medical textbook + guideline vectors)
- Returns top chunks with score ≥ 0.45

**Step 4 — Disease Ranking** `glinker/disease/ranker.py → rank_diseases()`
- Input: verified entities + `diagnosticQuery`
- TF-IDF cosine similarity against 359K rows
- Blended score: 60% TF-IDF + 40% symptom keyword overlap
- Returns top-5 diseases with normalized confidence

**Step 5 — openFDA** `glinker/rag/retrieval.py → get_medication_info()`
- Extracts medication-category entities from verified list
- Live HTTP call to openFDA API per drug
- Returns label sections: indications, contraindications, adverse reactions, dosage

**Step 6 — Combined Report** `glinker/diagnosis/combined_report.py → generate_combined_report()`
- Schema: `COMBINED_REPORT_SCHEMA` · Prompt: `COMBINED_REPORT_PROMPT` (`glinker/diagnosis/prompts.py`)
- **Single LLM call** producing all three sections:

  **Section A — Doctor Report** (clinical language)
  - Interview clinical summary · retrieval & medication summary
  - Recommended specialty + reasoning
  - Guideline considerations (each cited to source)
  - Medication flags from openFDA (each cited)
  - Retrieval status + confidence note

  **Section B — Patient Summary** (plain language)
  - Patient complaint summary (what they described, no diagnosis)
  - Referral specialty
  - Appointment guidance (from retrieved material only, attributed)
  - Medication notes (plain language, from openFDA)

  **Section C — Interpreted Diagnoses** (shared by both dashboards)
  - LLM evaluates every TF-IDF candidate against verified entities
  - Assigns `plausibility`: `likely` | `possible` | `unlikely`
  - `clinicalReason`: 1 sentence for doctor (why plausible/implausible)
  - `patientNote`: 1 plain-language sentence for patient, **empty string if `unlikely`**
    → patient never sees implausible candidates

---

### WHAT RETURNS TO EXPRESS

Flask `/pipeline/finalize` returns:
```json
{
  "verifiedEntities":     [...],
  "rankedDiseases":       [...],
  "ragQuery":             "...",
  "diagnosticQuery":      "...",
  "retrievedSources":     [...],
  "medicationInfo":       {...},
  "doctorReport":         { interviewClinicalSummary, retrievalAndMedicationSummary,
                            patientComplaintSummary, recommendedSpecialty, specialtyReasoning,
                            guidelineConsiderations[], medicationFlags[],
                            retrievalStatus, confidenceNote },
  "patientSummary":       { patientComplaintSummary, referralSpecialty,
                            appointmentGuidance[], medicationNotes[] },
  "interpretedDiagnoses": [ { disease, plausibility, clinicalReason, patientNote } ]
}
```

---

### WHAT GETS STORED IN DB

**sessions** collection `(Backend/models/Session.js)`
```
patient_id · started_at · completed_at · last_activity_at · turn_count
status: in_progress | completed | failed | abandoned
transcript[]: { turn_number, patient_raw, patient_corrected,
                assistant_message, voice_message_url }
```
Note: entities and disease_ranking were moved to Report (not in Session anymore).

**reports** collection `(Backend/models/Report.js)`
```
session_id (unique) · patient_id · generated_at
specialty · rag_query · diagnostic_query
entities[]          ← verified, LLM-cleaned
disease_ranking[]   ← raw TF-IDF scores (for debugging)
retrieved_chunks[]  · openfda_results

doctor_report {
  patientComplaintSummary · interviewClinicalSummary
  retrievalAndMedicationSummary · recommendedSpecialty · specialtyReasoning
  guidelineConsiderations[] · medicationFlags[]
  retrievalStatus · confidenceNote
}

patient_summary {
  patientComplaintSummary · referralSpecialty
  appointmentGuidance[] · medicationNotes[]
}

interpreted_diagnoses[] {        ← LLM-evaluated, single source for both dashboards
  disease · plausibility         ← likely | possible | unlikely
  clinicalReason                 ← for doctor dashboard
  patientNote                    ← for patient dashboard (empty if unlikely)
}
```

**Dashboard access pattern:**
- Doctor dashboard → reads `doctor_report` + all `interpreted_diagnoses` entries
- Patient dashboard → reads `patient_summary` + only `interpreted_diagnoses` where `plausibility != "unlikely"` and `patientNote != ""`

---

## File Responsibilities

| File | Job |
|------|-----|
| `api/app.py` | Flask entry point · routes · 7-step finalize pipeline · Ngrok launch |
| `glinker/config.py` | Shared model instances · LLM config (model, tokens, effort) |
| `glinker/interview/prompts.py` | INTERVIEW_PROMPT (SOCRATES) · INTERVIEW_FEWSHOT |
| `glinker/interview/session.py` | `run_interview_turn()` — builds message list, calls LLM |
| `glinker/diagnosis/prompts.py` | FINALIZE_PROMPT/SCHEMA/FEWSHOT · COMBINED_REPORT_PROMPT/SCHEMA |
| `glinker/diagnosis/finalize.py` | `run_gliner()` · `finalize_report()` — entity verify + ragQuery + diagnosticQuery |
| `glinker/diagnosis/combined_report.py` | `generate_combined_report()` — single call → doctor + patient + interpretedDiagnoses |
| `glinker/rag/ingestion.py` | Loads textbooks/guidelines, chunks, embeds, builds FAISS index |
| `glinker/rag/retrieval.py` | `load_index()` · `retrieve_context()` · `get_medication_info()` (openFDA) |
| `glinker/disease/ranker.py` | `load_datasets()` · `rank_diseases()` — TF-IDF + overlap blend |
| `glinker/utils.py` | `parse_json_response()` — safe JSON parse with fallback |
| `Backend/server.js` | Express app setup · 20MB JSON body limit (for voice base64) |
| `Backend/models/Session.js` | Session schema — transcript turns, status, timestamps |
| `Backend/models/Report.js` | Report schema — all AI outputs, interpreted_diagnoses |
| `Backend/controllers/sessionController.js` | `processTurn()` — orchestrates voice upload, Flask calls, DB writes |
| `main.ipynb` | Kaggle notebook — loads models, RAG index, disease datasets, launches Flask |

---

## Express Turn Flow (sessionController.js)

```
POST /api/sessions/:id/turn
  1. Fetch session — 404 if not found
  2. If status completed/failed/abandoned → 409 conflict
  3. If last_activity > 48 h → mark abandoned → 410
  4. If voice: base64 → Cloudinary (resource_type:"auto") → get secure URL
  5. Build history flatMap from transcript[].patient_corrected
  6. POST Flask /interview/turn → { status, message, correctedPatientText }
  7. Push turn to transcript[] · increment turn_count
  8. If status "complete":
       POST Flask /pipeline/finalize
       Create Report { entities, disease_ranking, doctor_report,
                       patient_summary, interpreted_diagnoses, ... }
       Return report_id to frontend
```

---

## Cost Breakdown (per patient visit)

| Phase | LLM Calls | Approx tokens |
|-------|-----------|---------------|
| Interview (5-6 turns avg) | 5-6 | ~500 output each |
| Finalize (entity verify + queries) | 1 | ~1200 output |
| Combined report (doctor + patient + diagnoses) | 1 | ~1500 output |
| **Total LLM calls** | **7-8** | |

Cost reduced from ~$0.03-0.04 → ~$0.01 by:
- Merging doctor + patient into one LLM call (saves 1 call + ~800 tokens)
- `reasoning_effort: low` (minimal hidden reasoning tokens)
- Tighter STOP EARLY prompt (fewer interview turns)

---

## Kaggle Setup

- GPU: T4 x2 · Python 3.12
- Secrets: `OpenAI Key` + `Ngrok Key` + `HF_TOKEN` via `UserSecretsClient`
- RAG index: loaded from `uresense-rag-index` Kaggle dataset (seconds); built from scratch only first time (20-40 min)
- 9 disease datasets added via Kaggle "Add Data"
- Cell 1: `git pull` from `hassan-branch` to get latest code
- Cell 7: `load_datasets()` — rebuilds TF-IDF from 9 CSVs (fast, in-memory)
- Cell 8: Flask on port 5001 (GPU 0, no tunnel)
- Cell 9: MedGemma on 5002 (GPU 1) + reverse proxy on 5003 + single ngrok tunnel → prints one URL for both `AI_SERVICE_URL` and `MEDGEMMA_SERVICE_URL`
- GitHub: `https://github.com/moizaimran/curesense-project` · AI branch: `hassan-branch` · Backend branch: `backend`

---

## Images Module (Medical Scan & Document Analysis)

### New Files
| File | Repo | Job |
|------|------|-----|
| `Backend/models/ImageUpload.js` | Backend | MongoDB schema — stores status, result, Cloudinary URL |
| `Backend/controllers/imageController.js` | Backend | Upload / list / poll endpoints + background AI dispatch |
| `Backend/routes/imageRoutes.js` | Backend | Mounts `/api/images` routes |
| `Mobile/app/(patient)/(tabs)/scan.tsx` | Mobile | Full Scan tab UI — picker, upload, polling, result modal |
| `CureSense_AI_Modules/api/medgemma_app.py` | AI | FastAPI service — X-ray single-image + CT/MRI multi-slice inference |

### Modified Files
| File | Change |
|------|--------|
| `Backend/server.js` | Register `/api/images` routes |
| `api/app.py` | Added `POST /images/analyze-pdf` (Flask, GPT-based) |
| `requirements.txt` | Added `pdfplumber`, `pypdfium2` |
| `main.ipynb` | Dual-GPU split, HF login (Cell 3), Flask-only Cell 8, proxy+MedGemma+ngrok Cell 9 |
| `Mobile/constants/api.ts` | Updated LAN IP |
| `Mobile/package.json` | Added `expo-document-picker`, `expo-file-system` |

### End-to-End Flow

**PDF Analysis (GPT)**
```
scan.tsx → POST /api/images (file_base64, upload_type:"pdf")
  → Backend: create ImageUpload record (status: processing)
  → Cloudinary upload (resource_type: raw, private)
  → POST ngrok/images/analyze-pdf → proxy:5003 → Flask:5001
  → Flask: pdfplumber extracts text → GPT analyzes
  → Returns: { summary, key_findings, recommendations, model_used }
  → Backend: save to MongoDB (status: complete)
  → Mobile: polls GET /api/images/:id → renders result modal
```

**X-ray Analysis (MedGemma)**
```
scan.tsx → POST /api/images (file_base64, upload_type:"xray")
  → Backend: create record → Cloudinary upload
  → POST ngrok/analyze/xray → proxy:5003 → MedGemma FastAPI:5002 (GPU 1)
  → MedGemma: single PIL image → _run_inference() → JSON
  → Returns: { summary, findings[], flagged_abnormal, abnormal_items[], impression }
  → Backend: save to MongoDB → Mobile: result modal with structured sections
```

**CT / MRI Analysis (MedGemma multi-slice)**
```
scan.tsx → POST /api/images (file_base64, upload_type:"ct_mri")
  → Backend: create record → Cloudinary upload
  → POST ngrok/analyze/ct-mri → proxy:5003 → MedGemma FastAPI:5002 (GPU 1)
  → MedGemma:
      CT:  DICOM → HU windowing → 3-channel RGB (wide/soft-tissue/brain windows)
      MRI: DICOM → min-max normalise → grayscale RGB
      Up to 85 slices extracted, sampled to 10 → single forward pass
  → Returns: { summary, modality, findings[], flagged_abnormal, impression }
  → Backend: save to MongoDB → Mobile: result modal
```

**Kaggle Notebook Single-URL Architecture**
```
one ngrok URL → FastAPI proxy on port 5003
  /analyze/*     →  MedGemma FastAPI on 5002  (GPU 1)
  everything else →  Flask on 5001             (GPU 0 — Whisper + GLiNER)
```

### Key Implementation Details
- **Polling**: Mobile polls every 3s up to 4 min; background job has 12 min timeout guard in Express
- **Retry policy**: 3 attempts with 1s/2s/4s backoff; HTTP errors (4xx/5xx) surface immediately without retrying
- **MedGemma fallback parser**: if model returns labeled text instead of JSON (common for 4B), `_parse_text_fallback()` extracts fields via regex
- **Privacy**: `storage_url` never sent to client; no PHI logged to console
- **GPU split**: Flask (Whisper + GLiNER) on GPU 0, MedGemma on GPU 1 via `device_map={"": 1}`