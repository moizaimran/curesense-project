# CureSense — AI Module Progress

---

## Models & Parameters

**LLM**
- Model: `gpt-5.6-luna` (reasoning model, lighter/cheaper than GPT-4 class)
- `reasoning_effort: low` — minimal hidden reasoning tokens (billed same as output)
- Token limits: interview turns 1000 · finalize 1200 · diagnosis/assessment 2000
- Structured outputs enforced via `response_format: json_schema, strict: True` on every call
- Safety cap: interview auto-closes at turn 12 without an LLM call

**GLiNER — Medical NER**
- Model: `Ihor/gliner-biomed-bi-large-v1.0` on CUDA
- 10 labels: symptom, medical condition, body part, severity, duration, medication, dosage, frequency, allergy, trigger
- Threshold: 0.4 confidence · runs once after interview completes

**Embedding (RAG + Disease)**
- Model: `BAAI/bge-base-en-v1.5` (768-dim, local, GPU, free — zero OpenAI cost)
- L2-normalised vectors · FAISS IndexFlatIP
- Note: rebuild both indexes if the model is changed

**Speech-to-Text**
- Model: `openai/whisper-large` on CUDA
- `task="translate"` — any language → English directly
- Transcribed via dedicated `/audio/transcribe` endpoint before the interview turn is processed

---

## Knowledge Base (RAG)

- **Sources:** `MedRAG/textbooks` + `epfl-llm/guidelines` (NICE, CDC, CMA, WHO, ICRC, CCO, SPOR, PubMed) + `MedRAG/statpearls`
- **Excluded:** WikiDoc (`audience: "patient"`) — patient summary LLM receives clinician chunks and writes in plain language
- **Chunking:** 600 tokens / 100 overlap at sentence boundaries
- **Embedding:** `BAAI/bge-large-en-v1.5` (1024-dim, 335M params) — upgraded from bge-base; rebuild both indexes after changing
- **Index:** FAISS `IndexFlatIP` · cosine similarity · **rebuild required** after adding StatPearls + bge-large upgrade
- **k=8** chunks returned; over-fetches k×5 before floor filter
- **Retrieval pipeline — 3 stages:**

  **Stage 1 — Multi-query hybrid search**
  - LLM generates 3 `ragQueries` variants (symptom-focused / condition-focused / treatment-focused)
  - Each variant is searched via FAISS dense + BM25 sparse + RRF; results merged across all 3 queries
  - Deduplication: same chunk from multiple queries keeps highest FAISS score
  - Hard floor `SIMILARITY_FLOOR = 0.35` before reranker (was static 0.45)
  - BM25 uses `_tokenize_for_bm25()` with PorterStemmer (nltk) — "hypertensive" and "hypertension" stem identically
  - Falls back to medical suffix stripping if nltk not installed; falls back to FAISS-only if rank_bm25 not installed

  **Stage 2 — MedCPT cross-encoder reranker**
  - `ncbi/MedCPT-Cross-Encoder` — trained on PubMed search logs; ~440MB; loaded lazily
  - Scores every (primary_query, chunk) pair with full cross-attention; resorts candidates by logit
  - Gracefully skipped if model unavailable (falls back to FAISS/RRF order)

  **Stage 3 — Dynamic threshold**
  - Threshold = `max(0.35, top_faiss_score × 0.60)`
  - Rises when strong evidence exists (top=0.85 → threshold=0.51); relaxes for weaker matches
  - Applied to original FAISS cosine score (not reranker logit) for consistent scale

- **Retrieval status:** `grounded` if max score ≥ 0.65; `partial` otherwise; `no_relevant_content` if empty
- **Medications:** NOT in vector DB — fetched live from openFDA API per drug per visit
- **Abbreviations in queries:** LLM instructed to never use abbreviations in ragQueries (write full terms)
- **Saved as:** `curesense-indexes` Kaggle dataset (loads in seconds; **rebuild needed** for bge-large + StatPearls)

---

## Disease Retrieval Module

- **Method:** FAISS semantic search (replaces the old TF-IDF ranker)
- **Data:** HPO + ICD-10 disease paragraphs, indexed with `bge-base-en-v1.5`
- **Index:** `disease_index/disease_index.faiss` · loaded via `load_disease_index()`
- **Query:** symptom/trigger/body-part/severity/duration keywords from verified entities + LLM `diagnosticQuery`
  - Medications excluded from query — they bias toward medication-specific conditions
  - BGE instruction prefix added: `"Represent this sentence for searching relevant passages: "`
- **Similarity threshold:** 0.65
- **Top-K:** 5 candidates returned to the LLM
- **Filter:** disease entries named after a reported symptom (e.g. "Cough", "Sore Throat") are skipped — not diagnoses
- **Graceful degradation:** returns `[]` if index not loaded; LLM falls back to clinical knowledge

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

**Kaggle dual-GPU split:**
- GPU 0 → Flask (Whisper + GLiNER + RAG/disease FAISS)
- GPU 1 → MedGemma FastAPI (port 5002)
- FastAPI proxy on port 5003 routes `/analyze/*` → MedGemma, everything else → Flask
- Single ngrok URL exposes both services via the proxy

---

## Complete Pipeline Flow (with responsible files)

### INTERVIEW PHASE

```
Patient types or speaks
        ↓
[Voice only] POST /audio/transcribe → Whisper → English text
        ↓
POST /interview/turn  (api/app.py)
        ↓
glinker/interview/session.py → run_interview_turn()
  · Builds full message list: [system prompt + few-shots + live history]
  · System prompt: INTERVIEW_PROMPT (glinker/interview/prompts.py)
    - SOCRATES framework: Site, Onset, Character, Radiation, Associations,
      Time/duration, Exacerbating/relieving, Severity
    - Also covers medications and allergies
    - Credits volunteered info — never asks about something already answered
    - Never repeats a question (reads own history each turn)
    - Emergency: adds 1-line safety message then keeps interviewing (never completes early)
    - STOP RULE: all 10 items must be ticked before status=complete
    - Safety cap: turn ≥ 12 → Flask returns complete without calling LLM
  · Returns: { status: "continue"|"complete", message, correctedPatientText,
               questionType, options, sessionName }
        ↓
Express (Backend/controllers/sessionController.js)
  · Saves turn to session.transcript[]
  · If voice: audio uploaded to Cloudinary first, URL sent to Flask /audio/transcribe
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
  - JOB 3: Write `diagnosticQuery` — symptom-only plain terms, NO meds/conditions, for disease FAISS
  - Also maps every medication (interview + profile) to its US generic name for openFDA
- Returns: `{ entities[], ragQuery, diagnosticQuery, medications[] }`

**Step 3 — RAG Retrieval** `glinker/rag/retrieval.py → retrieve_context()`
- Hybrid search: FAISS dense + BM25 sparse, merged via RRF
- Returns up to 8 chunks with score ≥ 0.45

**Step 4 — Disease Retrieval** `glinker/disease/disease_retrieval.py → retrieve_diseases()`
- Semantic FAISS search against HPO + ICD-10 disease paragraph index
- Returns top-5 disease candidates with ICD code + similarity confidence
- Symptom-named matches filtered out

**Step 5 — openFDA** `glinker/rag/retrieval.py → get_medication_info()`
- Extracts medication entities from verified list + profile medications
- Resolves brand/local names to US generics using the finalize step's mapping
- Deduplicates by generic name (Losartan + Losartan 50mg daily = one call)
- Returns `label_found: false` with empty sections when nothing found (never skips)
- LLM receives trimmed view of only 4 safety sections: contraindications, warnings_and_precautions, drug_interactions, adverse_reactions

**Step 6 — LLM Call 1: Diagnosis Assessment** `glinker/diagnosis/assessment.py → generate_diagnosis_assessment()`
- Takes: verified entities + disease candidates + medication info + retrieved chunks + transcript + patient profile
- 3 jobs in one call:
  - JOB 1: Evaluate each disease candidate → `interpretedDiagnoses[]` with `plausibility` (likely/possible/unlikely), `clinicalReason`, `patientNote`, `icd_code`
  - JOB 2: Flag medication safety → `medicationFlags[]` (drug, flag, severity, source)
  - JOB 3: Assess emergency status → `emergencyWarning` {triggered, reason, message}
- `verified` on each medicationFlag is set **in code** (never by LLM) — True only when openFDA returned a real label
- Emergency double-verified: LLM result merged with `check_emergency_list()` code-based check; either source can trigger it

**Steps 7 & 8 — LLM Calls 2 & 3: Doctor Report + Patient Summary (concurrent)**

Both depend on assessment but are independent of each other — run in parallel via `ThreadPoolExecutor(max_workers=2)`:

- `glinker/diagnosis/doctor_report.py → generate_doctor_report()` — clinical language, for doctor dashboard
- `glinker/diagnosis/patient_summary.py → generate_patient_summary()` — plain language, for patient

---

### WHAT RETURNS TO EXPRESS

Flask `/pipeline/finalize` returns:
```json
{
  "verifiedEntities"    : [...],
  "rankedDiseases"      : [...],
  "ragQuery"            : "...",
  "diagnosticQuery"     : "...",
  "retrievedSources"    : [...],
  "medicationInfo"      : {...},
  "emergencyWarning"    : { "triggered": bool, "reason": "...", "message": "..." },
  "interpretedDiagnoses": [ { "disease", "icd_code", "plausibility", "clinicalReason", "patientNote" } ],
  "doctorReport"        : { ... },
  "patientSummary"      : { ... }
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

**reports** collection `(Backend/models/Report.js)`
```
session_id (unique) · patient_id · generated_at
specialty · rag_query · diagnostic_query
entities[]          ← verified, LLM-cleaned
disease_ranking[]   ← raw semantic scores (for debugging)
retrieved_chunks[]  · openfda_results
emergency_warning   ← { triggered, reason, message }

doctor_report { ... }
patient_summary { ... }

interpreted_diagnoses[] {
  disease · icd_code
  plausibility           ← likely | possible | unlikely
  clinicalReason         ← for doctor dashboard
  patientNote            ← for patient dashboard (empty string if unlikely)
}
```

**Dashboard access pattern:**
- Doctor dashboard → reads `doctor_report` + all `interpreted_diagnoses` entries + `emergency_warning`
- Patient dashboard → reads `patient_summary` + only `interpreted_diagnoses` where `plausibility != "unlikely"` and `patientNote != ""`

---

## File Responsibilities

| File | Job |
|------|-----|
| `api/app.py` | Flask entry point · 8-step finalize pipeline · audio/image routes · Ngrok launch |
| `glinker/config.py` | Shared model instances · LLM config (model, tokens, effort) · embedding model name |
| `glinker/interview/prompts.py` | INTERVIEW_PROMPT (SOCRATES + stop rule) · INTERVIEW_SCHEMA · INTERVIEW_FEWSHOT |
| `glinker/interview/session.py` | `run_interview_turn()` — builds message list, calls LLM |
| `glinker/diagnosis/prompts.py` | FINALIZE_PROMPT/SCHEMA/FEWSHOT |
| `glinker/diagnosis/finalize.py` | `run_gliner()` · `finalize_report()` — entity verify + ragQuery + diagnosticQuery + generic name map |
| `glinker/diagnosis/assessment.py` | `generate_diagnosis_assessment()` — Call 1: plausibility + medication flags + emergency |
| `glinker/diagnosis/assessment_prompts.py` | ASSESSMENT_PROMPT / ASSESSMENT_SCHEMA / ASSESSMENT_FEWSHOT |
| `glinker/diagnosis/doctor_report.py` | `generate_doctor_report()` — Call 2 (concurrent) |
| `glinker/diagnosis/doctor_report_prompts.py` | Doctor report prompt + schema |
| `glinker/diagnosis/patient_summary.py` | `generate_patient_summary()` — Call 3 (concurrent) |
| `glinker/diagnosis/patient_summary_prompts.py` | Patient summary prompt + schema |
| `glinker/diagnosis/emergency_flags.py` | `check_emergency_list()` — code-based emergency safety net |
| `glinker/rag/ingestion.py` | Loads textbooks/guidelines, chunks, embeds, builds FAISS index |
| `glinker/rag/retrieval.py` | `load_index()` · `retrieve_context()` (hybrid FAISS+BM25+RRF) · `get_medication_info()` · `trim_medication_info()` |
| `glinker/rag/corpus.py` | `fetch_openfda()` — live openFDA API caller |
| `glinker/disease/disease_retrieval.py` | `load_disease_index()` · `retrieve_diseases()` — semantic FAISS over HPO/ICD-10 |
| `glinker/utils.py` | `call_llm()` — LLM call wrapper with fallback · `parse_json_response()` |
| `Backend/server.js` | Express app setup · 20MB JSON body limit (for voice base64) |
| `Backend/models/Session.js` | Session schema — transcript turns, status, timestamps |
| `Backend/models/Report.js` | Report schema — all AI outputs, interpreted_diagnoses, emergency_warning |
| `Backend/controllers/sessionController.js` | `processTurn()` — orchestrates voice upload, Flask calls, DB writes |
| `main.ipynb` | Kaggle notebook — loads models, RAG/disease indexes, launches Flask + MedGemma |

---

## Express Turn Flow (sessionController.js)

```
POST /api/sessions/:id/turn
  1. Fetch session — 404 if not found
  2. If status completed/failed/abandoned → 409 conflict
  3. If last_activity > 48 h → mark abandoned → 410
  4. If voice: base64 → Cloudinary → POST Flask /audio/transcribe → English text
  5. Build history flatMap from transcript[].patient_corrected
  6. POST Flask /interview/turn → { status, message, correctedPatientText, ... }
  7. Push turn to transcript[] · increment turn_count
  8. If status "complete":
       POST Flask /pipeline/finalize
       Create Report { entities, disease_ranking, emergency_warning,
                       doctor_report, patient_summary, interpreted_diagnoses, ... }
       Return report_id to frontend
```

---

## LLM Call Structure (finalize phase)

| Call | Function | Runs | Output |
|------|----------|------|--------|
| Finalize | `finalize_report()` | Sequential (must be first) | verified entities, ragQuery, diagnosticQuery, medication generic names |
| Call 1 | `generate_diagnosis_assessment()` | Sequential (needs finalize output) | interpretedDiagnoses, medicationFlags, emergencyWarning |
| Call 2 | `generate_doctor_report()` | Concurrent with Call 3 | doctor report sections |
| Call 3 | `generate_patient_summary()` | Concurrent with Call 2 | patient summary sections |

**Total LLM calls per visit:** ~7-8 (5-6 interview turns + 1 finalize + 1 assessment + 2 report/summary concurrent)

Cost reduced from ~$0.03-0.04 → ~$0.01 by:
- `reasoning_effort: low`
- Calls 2 & 3 run concurrently (no wall-clock penalty for the split)
- Tighter STOP EARLY prompt (fewer interview turns)

---

## Cost Breakdown (per patient visit)

| Phase | LLM Calls | Approx tokens |
|-------|-----------|---------------|
| Interview (5-6 turns avg) | 5-6 | ~1000 output each |
| Finalize (entity verify + queries) | 1 | ~1200 output |
| Assessment (diagnoses + flags + emergency) | 1 | ~2000 output |
| Doctor Report | 1 | ~800 output |
| Patient Summary | 1 (concurrent) | ~700 output |
| **Total LLM calls** | **9-10** | |

---

## Kaggle Setup

- GPU: T4 x2 · Python 3.12
- Secrets: `OpenAI Key` + `Ngrok Key` + `HF_TOKEN` via `UserSecretsClient`
- Cell 1: `git pull` from `hassan-branch` to get latest code
- Cell 1 install: `!pip install -q nltk transformers` (new deps for reranker + BM25 stemmer)
- RAG index: loaded from `curesense-indexes` Kaggle dataset → `rag_index/` (seconds) — **rebuild needed** (bge-large + StatPearls)
- Disease index: loaded from `curesense-indexes` Kaggle dataset → `disease_index/` (seconds) — **rebuild needed** (bge-large)
- Cell 7: `load_disease_index()` — loads disease FAISS from dataset
- Cell 8: Flask on port 5001 (GPU 0 — Whisper + GLiNER + RAG)
- Cell 9: MedGemma on 5002 (GPU 1) + reverse proxy on 5003 + single ngrok tunnel → prints one URL for both `AI_SERVICE_URL` and `MEDGEMMA_SERVICE_URL`
- GitHub: `https://github.com/moizaimran/curesense-project` · AI branch: `hassan-branch`

---

## Images Module (Medical Scan & Document Analysis)

### Flask Endpoints (api/app.py)
| Endpoint | Job |
|----------|-----|
| `POST /images/analyze-pdf` | Extract text via pdfplumber + GPT analysis |
| `POST /images/correlate-with-report` | Correlate MedGemma/PDF image analysis with the patient's interview report |

### File Responsibilities
| File | Repo | Job |
|------|------|-----|
| `Backend/models/ImageUpload.js` | Backend | MongoDB schema — stores status, result, Cloudinary URLs |
| `Backend/controllers/imageController.js` | Backend | Upload / list / poll endpoints + background AI dispatch |
| `Backend/routes/imageRoutes.js` | Backend | Mounts `/api/images` routes |
| `Mobile/app/(patient)/(tabs)/scan.tsx` | Mobile | Full Scan tab UI — picker, upload, polling, result modal |
| `CureSense_AI_Modules/api/medgemma_app.py` | AI | FastAPI service — X-ray single-image + CT/MRI multi-slice inference |
| `CureSense_AI_Modules/glinker/images/pdf_analysis.py` | AI | PDF text extraction + GPT analysis |
| `CureSense_AI_Modules/glinker/images/correlation.py` | AI | `correlate_image_with_report()` — image × interview report cross-reference |

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

**CT / MRI Analysis (MedGemma montage)**
```
scan.tsx → POST /api/images (file_base64, upload_type:"ct_mri")
  → Backend: create ImageUpload record (status: processing)
      → try upload original ZIP to Cloudinary (raw, authenticated) → zip_url
        (best-effort; if >~100 MB free-tier limit, zip_url stays "" — analysis continues)
  → POST ngrok/analyze/ct-mri → proxy:5003 → MedGemma FastAPI:5002 (GPU 1)
  → MedGemma:
      CT:  DICOM → HU windowing → 3-channel RGB (wide/soft-tissue/brain windows)
      MRI: DICOM → min-max normalise → grayscale RGB
      Up to 85 slices extracted, sampled to INFERENCE_SLICES=4 evenly-spaced
      Stack 4 slices at 448×448 each → single 448×1792 canvas image → feed to model
      Generates thumbnail montage (up to 9 tiles, ~30-100 KB)
  → Returns: { summary, modality, findings[], flagged_abnormal, impression,
               canvas_b64, thumbnail_b64 }
  → Backend: canvas_b64 + thumbnail_b64 → Cloudinary → save URLs to MongoDB
  → Mobile: polls GET /api/images/:id → renders result modal
```

### MedGemma Working Config (T4, confirmed)
- `torch_dtype=torch.bfloat16` — fixes all-pad output; float16 overflows vision encoder activations
- `attn_implementation="eager"` — prevents dynamo/torch.compile crash on T4
- `torch._dynamo.config.disable = True` (set BEFORE `from_pretrained`) — prevents per-token JIT attempts
- `INFERENCE_SLICES = 4` — safe with montage approach (always 1 SigLIP forward pass)
- **Must be set together** — any combination of only 2 of the 3 fails on T4

### CT/MRI ZIP — Supported Formats
| Supported | Not Supported |
|-----------|---------------|
| DICOM files (with/without .dcm extension, magic bytes) | Philips PAR/REC format |
| .dcm in subfolders | NIfTI (.nii, .nii.gz) |
| JPEG/PNG slices | Pre-1993 DICOM without standard preamble |
| Mixed content (viewer exe + DICOM on CD) | PDF uploaded into X-ray/CT slot |
| Multiple series → auto-selects largest (axial wins) | Image uploaded into PDF slot |
