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
- Model: `openai/whisper-base` on CUDA (optional — only for voice input)

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

## Folder Structure

```
CureSense_AI_Modules/
├── pipeline.py              # orchestrates all 8 steps
├── requirements.txt
├── PROGRESS.md
│
├── glinker/
│   ├── config.py            # shared model slots + LLM config
│   ├── utils.py             # defensive JSON parser
│   │
│   ├── interview/
│   │   ├── prompts.py       # SOCRATES system prompt + JSON schema
│   │   └── session.py       # per-turn LLM call + PatientInterview class
│   │
│   ├── diagnosis/
│   │   ├── prompts.py       # all 3 prompts + schemas (finalize/doctor/patient)
│   │   ├── finalize.py      # GLiNER runner + entity verification LLM
│   │   ├── doctor_report.py # clinician-facing grounded report
│   │   └── patient_summary.py # plain-language patient output
│   │
│   ├── rag/
│   │   ├── corpus.py        # openFDA live API caller
│   │   ├── ingestion.py     # one-time FAISS index builder
│   │   └── retrieval.py     # runtime semantic search
│   │
│   └── disease/
│       └── ranker.py        # TF-IDF disease ranking from 9 datasets
│
└── tests/
    ├── simulated_patient.py # LLM-powered fake patient for testing
    └── test_run.py          # end-to-end test runner + HEADACHE_CASE / KNEE_CASE
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
- Secrets: `OPENAI_API_KEY` via `UserSecretsClient`
- RAG index persisted as Kaggle Dataset `uresense-rag-index` (92 MB zip)
- 9 disease datasets added via Kaggle "Add Data" — auto-mounted at `/kaggle/input/datasets/{username}/{name}/`
- GitHub repo: `https://github.com/moizaimran/curesense-project` · branch: `hassan-branch`
