# GLINKER — Progress Report

## Models & Parameters

**LLM**
- Model: `gpt-5.6-luna` (reasoning model)
- `reasoning_effort: low`
- Token limits: interview turns 500 · finalize 1200 · doctor report 1500 · patient summary 800
- Structured outputs enforced via `response_format: json_schema` on every call

**GLiNER — Medical NER**
- Model: `Ihor/gliner-biomed-bi-large-v1.0` on CUDA
- Labels: symptom, medical condition, body part, severity, duration, medication, dosage, frequency, allergy, trigger
- Threshold: 0.4 confidence · runs once after interview completes

**Embedding (RAG)**
- Model: `BAAI/bge-small-en-v1.5` (local, GPU, free)
- Dim: 384 · L2-normalised vectors
- No OpenAI API for embedding — zero cost, no rate limits

**Speech-to-Text**
- Model: `openai/whisper-large` on CUDA
- `task="translate"` — transcribes any language directly to English
- Runs only on voice turns before the LLM spelling-correction pass

---

## Knowledge Base (RAG)

- **Sources:** `MedRAG/textbooks` (5,000 entries) + `epfl-llm/guidelines` (2,000 entries) from HuggingFace
- **Chunking:** 600 tokens / 100 overlap at sentence boundaries
- **Index:** FAISS `IndexFlatIP` · 44,231 vectors · cosine similarity
- **Threshold:** 0.45 similarity score to include a chunk
- **Medications:** NOT in vector DB — fetched live from openFDA API per drug per visit
- **Build time:** ~5-8 min on Kaggle GPU T4 · saved as `uresense-rag-index` Kaggle dataset

---

## Disease Ranking

- **Method:** TF-IDF (`max_features=30,000`, `ngram_range=(1,3)`, `sublinear_tf=True`)
- **Data:** 9 Kaggle symptom-disease CSV datasets · 359,632 rows · 2,127 unique diseases
- **Query:** symptom + body part + trigger + severity + duration entities only (medications excluded to prevent bias)
- **Output:** top-5 ranked diseases with confidence scores

---

## System Architecture

```
React Frontend
      ↓
Express / Node.js  (port 5000)
      ↓                    ↓
MongoDB Atlas         Flask + Ngrok  (Kaggle T4 GPU)
                      AI microservice only — no DB access
```

The AI notebook is a **stateless microservice**. Express owns all persistence. Every request to Flask is self-contained — no in-memory session state, no turn counters inside Flask.

---

## Flask API (AI Microservice)

**POST /interview/turn**
- Input: `{ turn_number, history, patient_text }` or `{ turn_number, history, patient_audio_url }`
- Voice path: Whisper `task="translate"` → raw English text → LLM spelling-correction pass
- Express supplies full live history each call; Flask prepends system prompt + few-shots internally
- Cap check: if `turn_number ≥ 12` returns closing message without making an LLM call
- Output: `{ status, message, rawPatientText, correctedPatientText }`
  - `rawPatientText` — Whisper output (voice) or echoed input (text), before LLM correction
  - `correctedPatientText` — after LLM spelling-correction pass

**POST /pipeline/finalize**
- Input: `{ full_transcript_text }`
- Runs full 6-step pipeline: GLiNER → finalize → RAG → openFDA → doctor report → patient summary
- Output: `{ verifiedEntities, rankedDiseases, ragQuery, retrievedSources, medicationInfo, doctorReport, patientSummary }`

**Launch:** `api/app.launch(port=5001)` — Flask runs in daemon thread, Ngrok tunnels it, returns public URL

---

## Pipeline Flow

```
Patient speaks / types
        ↓
[1] Interview (session.py)
    · SOCRATES-structured intake · LLM asks one question per turn
    · Grammar corrected each turn · max 12 turns
        ↓
[2] GLiNER (finalize.py → run_gliner)
    · Extracts raw medical entities from full transcript
        ↓
[3] Disease Ranking (ranker.py → rank_diseases)
    · TF-IDF match against 359K rows using symptom entities only
        ↓
[4] Finalize (finalize.py → finalize_report)
    · LLM verifies/cleans entities · builds dense ragQuery
        ↓
[5] RAG Retrieval (retrieval.py → retrieve_context)
    · Embeds ragQuery · searches FAISS · returns top-4 chunks ≥ 0.45 score
        ↓
[6] openFDA (corpus.py → fetch_openfda)
    · Live API call per medication · returns drug label sections
        ↓
[7] Doctor Report (doctor_report.py)
    · Specialty routing · clinical considerations from guidelines · medication flags
    · All claims cited to source
        ↓
[8] Patient Summary (patient_summary.py)
    · Plain-language · specialty routing · what to expect · medication notes
```

---

## MongoDB Collections

**patients**
`name · dob · gender · contact{phone,email} · allergies[] · current_medications[]`

**sessions**
`patient_id · started_at · completed_at · last_activity_at · turn_count`
`status: in_progress | completed | failed | abandoned`
`transcript[]: { turn_number, patient_raw, patient_corrected, assistant_message, voice_message_url }`
`entities[] · disease_ranking[] · rag_query` ← populated on finalize

**reports**
`session_id (unique) · patient_id (denorm) · specialty · rag_query`
`retrieved_chunks[] · openfda_results · doctor_report · patient_summary`

**Indexes:** `sessions.patient_id` · `reports.patient_id` · `reports.session_id` (unique)

---

## Express Backend — Session Turn Flow

```
POST /api/sessions/:id/turn
  1. Fetch session — 404 if missing
  2. If status completed/failed/abandoned → 409
  3. If last_activity_at > 48 h → mark abandoned → 410
  4. If voice: upload to Cloudinary (resource_type:"auto") → get URL
  5. Build history from transcript[].patient_corrected (flatMap user/assistant pairs)
  6. POST Flask /interview/turn → { status, message, rawPatientText, correctedPatientText }
  7. Push turn to transcript · increment turn_count · last_activity_at refreshed by pre-save hook
  8. If status "complete":
       POST Flask /pipeline/finalize with joined correctedPatientText
       Save entities/disease_ranking/rag_query → session
       Create Report document → return report_id
```

---

## Folder Structure

```
CureSense_AI_Modules/          ← git repo root (hassan-branch)
├── pipeline.py
├── requirements.txt           # flask, pyngrok, gliner, whisper, faiss-cpu, ...
├── PROGRESS.md
│
├── api/
│   └── app.py                 # Flask stateless API + launch() for Ngrok
│
├── glinker/
│   ├── config.py
│   ├── utils.py
│   ├── interview/
│   │   ├── prompts.py
│   │   └── session.py
│   ├── diagnosis/
│   │   ├── prompts.py
│   │   ├── finalize.py
│   │   ├── doctor_report.py
│   │   └── patient_summary.py
│   ├── rag/
│   │   ├── corpus.py
│   │   ├── ingestion.py
│   │   └── retrieval.py
│   └── disease/
│       └── ranker.py
│
└── tests/
    ├── simulated_patient.py
    └── test_run.py

Backend/                       ← Node/Express (separate from AI repo)
├── server.js
├── package.json
├── .env                       # MONGODB_URI, AI_SERVICE_URL, CLOUDINARY_*
├── config/
│   ├── db.js                  # Mongoose Atlas connection
│   └── cloudinary.js          # Cloudinary v2 client
├── models/
│   ├── Patient.js
│   ├── Session.js
│   └── Report.js
├── controllers/
│   ├── patientController.js
│   ├── sessionController.js   # processTurn — orchestrates Flask + DB writes
│   └── reportController.js
└── routes/
    ├── patientRoutes.js
    ├── sessionRoutes.js       # POST /:id/turn
    └── reportRoutes.js
```

---

## Output

Two outputs generated per patient visit:

| Output | Audience | Contains |
|---|---|---|
| Doctor Report | Clinician | Specialty routing + reasoning · guideline-grounded clinical considerations · openFDA medication flags · retrieval status |
| Patient Summary | Patient | Plain-language recap · specialty · what to expect · medication notes |

---

## Kaggle Setup

- GPU: T4 x2 · Python 3.12
- Secrets: `OpenAI Key` + `Ngrok Key` via `UserSecretsClient`
- RAG index: loaded from `uresense-rag-index` Kaggle dataset if attached (seconds); built from scratch only if missing (20-40 min)
- 9 disease datasets added via Kaggle "Add Data"
- Cell 8 launches Flask + Ngrok → prints `AI_SERVICE_URL` to paste into Express `.env`
- GitHub repo: `https://github.com/moizaimran/curesense-project` · branch: `hassan-branch`
