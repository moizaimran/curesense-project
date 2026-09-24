# CureSense AI Modules

This is the AI backend for the CureSense health platform. It runs on a **Kaggle GPU notebook** (for the main pipeline) and a **Google Colab notebook** (for medical image analysis). The Express backend talks to both services using public HTTPS URLs provided by ngrok.

---

## How It Works — Big Picture

```
Patient (Mobile App)
        │
        ▼
Express Backend (Node.js)
        │
        ├── Interview turn / finalize session ──► Flask on Kaggle  (port 5001)
        │                                          Whisper + GLiNER + GPT + FAISS
        │
        ├── X-ray / CT / MRI upload ───────────► FastAPI on Colab  (port 5002)
        │                                          MedGemma 4B
        │
        └── PDF / lab report upload ────────────► Flask on Kaggle  (port 5001)
                                                   GPT vision / text
```

The Flask service is **stateless** — it does not touch MongoDB. All session state lives in Express. Every request to Flask is self-contained.

---

## File Structure

```
CureSense_AI_Modules/
│
├── main.ipynb                  ← Run this on Kaggle (9 cells, see below)
├── colab_medgemma.ipynb        ← Run this on Google Colab for image analysis
├── pipeline.py                 ← Legacy local test runner (not used in production)
├── requirements.txt            ← Python dependencies
│
├── api/
│   ├── app.py                  ← Flask app — all HTTP endpoints for Kaggle service
│   └── medgemma_app.py         ← FastAPI app — MedGemma image analysis (Colab)
│
├── glinker/                    ← Main Python package
│   ├── config.py               ← Shared model instances + LLM settings
│   ├── utils.py                ← LLM call helper with retries and fallback
│   │
│   ├── interview/
│   │   ├── prompts.py          ← System prompt, output schema, few-shot examples
│   │   └── session.py          ← PatientInterview class (manages conversation)
│   │
│   ├── diagnosis/
│   │   ├── finalize.py         ← GLiNER entity extraction + LLM entity verification
│   │   ├── assessment.py       ← Diagnostic assessment LLM call
│   │   ├── doctor_report.py    ← Doctor-facing report generation
│   │   ├── patient_summary.py  ← Patient-facing summary generation
│   │   ├── emergency_flags.py  ← Red-flag / emergency warning detection
│   │   ├── prompts.py          ← Finalize prompt + schema
│   │   ├── assessment_prompts.py
│   │   ├── doctor_report_prompts.py
│   │   └── patient_summary_prompts.py
│   │
│   ├── rag/
│   │   ├── corpus.py           ← Downloads and chunks the text corpora
│   │   ├── ingestion.py        ← Builds FAISS indexes from chunks
│   │   └── retrieval.py        ← Query-time FAISS search + openFDA medication lookup
│   │
│   ├── disease/
│   │   ├── build_disease_index.py (in scripts/) ← Builds disease FAISS index
│   │   ├── disease_retrieval.py ← Query-time disease candidate retrieval
│   │   └── ranker.py           ← Legacy TF-IDF ranker (replaced by FAISS)
│   │
│   └── images/
│       └── pdf_analysis.py     ← PDF analysis via GPT (text path + vision path)
│
├── scripts/
│   └── build_disease_index.py  ← One-time script to build the disease FAISS index
│
└── tests/
    ├── simulated_patient.py    ← Simulates patient answers for testing
    └── test_run.py             ← End-to-end test runner
```

---

## Kaggle Notebook — `main.ipynb`

The notebook has **9 cells** that must be run in order at the start of every Kaggle session.

| Cell | What it does |
|------|-------------|
| 1 | Clones / pulls the latest `hassan-branch` from GitHub |
| 2 | Installs all Python dependencies from `requirements.txt` |
| 3 | Loads secrets (ngrok token, OpenAI API key) from Kaggle Secrets |
| 4 | Loads Whisper Large and GLiNER BioMed onto the GPU |
| 5 | Copies the pre-built RAG index from the `uresense-rag-index` Kaggle dataset (or builds it from scratch if not found — takes ~60–90 min) |
| 6 | Copies the disease index from the `curesense-disease-index` Kaggle dataset (or builds it in ~5–10 min) |
| 7 | Loads both indexes into memory (must run before Flask starts) |
| 8 | Starts Flask in a background thread on port 5001 |
| 9 | Creates an ngrok tunnel and prints `AI_SERVICE_URL` — paste this into `Backend/.env` |

---

## Module 1 — AI Interview

### What it does

The interview is an AI-driven medical intake conversation. The patient describes their symptoms, and the AI asks structured follow-up questions to collect all the information a doctor needs before a consultation. It follows the **SOCRATES** clinical framework (Site, Onset, Character, Radiation, Associated symptoms, Time course, Exacerbating/relieving factors, Severity) plus medications and allergies.

### How a single turn works

```
Patient sends a message (text or voice)
        │
        ▼  (voice only)
Whisper Large → transcribes + translates to English
        │
        ▼
Flask /interview/turn
        │
        ├── Builds full conversation history (system prompt + few-shot examples + live turns)
        │
        ▼
GPT (gpt-5.6-luna, low reasoning)
        │
        Returns structured JSON with:
        ├── correctedPatientText  — spelling fixed, Roman Urdu silently translated to English
        ├── status                — "continue" or "complete"
        ├── message               — the AI's next question (in plain English)
        ├── questionType          — how the mobile app should render the answer input
        └── options               — choices for yes_no and mcq question types
```

### Question types

The AI always picks the most interactive question format:

| Type | When used | Example |
|------|-----------|---------|
| `yes_no` | Binary choice — renders two buttons | "Have you had this before?" → [Yes] [No] |
| `yes_no` with named options | "A or B" questions — renders named buttons instead of Yes/No | "Does it spread to the leg or the foot?" → [Leg] [Foot] |
| `mcq` | Bounded set of choices — renders a list | "What does the pain feel like?" → [Sharp, Throbbing, Dull, Burning, Tight] |
| `scale` | Severity 1–10 — renders a slider | "How severe is the pain on a scale of 1–10?" |
| `number` | A specific count — renders a number pad | "How many days has this been going on?" |
| `text` | Truly open-ended — renders a text box | Used only as a last resort |

### Roman Urdu handling

If a patient types in Roman Urdu (Urdu written in English letters, e.g. *"pet mein dard hai"*), the AI silently translates it into correct English inside `correctedPatientText`. It never asks the patient "Did you mean...?" — it just translates and moves straight to the next question. The corrected text is what gets stored in the transcript and used by GLiNER.

### Interview completion

The AI tracks all 10 dimensions internally. Once all are covered, it sets `status: "complete"`. There is also a hard cap of **12 turns** — if the interview hasn't completed by then, it is forced to finish. After completion, the session is handed to the pipeline finalization step.

### Key files

| File | Purpose |
|------|---------|
| `glinker/interview/prompts.py` | The full system prompt with all rules, the JSON output schema, and 8-turn few-shot example |
| `glinker/interview/session.py` | `PatientInterview` class that manages `history`, `transcript_parts`, and turn count |
| `api/app.py` `/interview/turn` | Flask endpoint that receives each turn from Express |

---

## Module 2 — Pipeline Finalization

After the interview ends, the full transcript goes through a multi-step pipeline that runs mostly in parallel.

```
Full transcript text
        │
        ├──► GLiNER BioMed ──────────────────────────────────────────────────────────────┐
        │    Extracts: symptoms, body parts, medications, allergies, severity, duration   │
        │                                                                                 │
        ├──► GPT (finalize) ─────────────────────────────────────────────────────────────┤
        │    Verifies GLiNER entities, produces ragQuery + diagnosticQuery                │
        │                                                                                 │
        │                        ┌────────────────────────────────────────────────────────┘
        │                        ▼
        ├──► FAISS (clinician RAG) ─── top chunks from medical textbooks + guidelines
        ├──► FAISS (patient RAG)   ─── top chunks from patient-friendly corpus
        ├──► FAISS (disease index) ─── top disease candidates by semantic similarity
        └──► openFDA API           ─── drug label info for each medication mentioned
                        │
                        ▼
        GPT calls (run in parallel):
        ├── Diagnostic assessment   → ranked differential diagnoses with reasoning
        ├── Emergency flags check   → detects red-flag symptoms needing urgent care
        ├── Doctor report           → structured clinical report for the clinician
        └── Patient summary         → plain-English summary for the patient
```

Everything is saved to the MongoDB `Report` document via Express. The doctor sees the full clinical report; the patient sees the plain-English summary.

---

## Module 3 — Medical Image Analysis

Medical images are handled by a **separate FastAPI service** running on Google Colab with a T4 GPU. The model is **Google MedGemma 1.5-4B**, a vision-language model fine-tuned on medical images.

### The Colab notebook (`colab_medgemma.ipynb`)

Run this on Google Colab. It:
1. Installs dependencies (`fastapi`, `uvicorn`, `pydicom`, `pdfplumber`, etc.)
2. Downloads MedGemma from HuggingFace (loaded once, stays in memory)
3. Starts FastAPI on port 5002
4. Creates an ngrok tunnel and prints `MEDGEMMA_SERVICE_URL` — paste into `Backend/.env`

### Upload types and routing

When a patient uploads a file, Express detects the real file type from magic bytes and routes it:

| User selects | File detected | Routed to |
|---|---|---|
| `pdf` | PDF (`%PDF`) | Flask → GPT |
| `xray` | JPEG / PNG / DICOM | Colab → MedGemma `/analyze/xray` |
| `ct_mri` | ZIP (DICOM series) / DICOM / JPEG | Colab → MedGemma `/analyze/ct-mri` |

If the detected type doesn't match what the user selected, Express rejects it with a clear message (e.g. "That looks like a PDF — use the PDF option instead").

---

### X-Ray Analysis

Input: a single JPEG or PNG image, sent as base64.

Preprocessing: none — the image is decoded directly to RGB and passed to MedGemma as-is.

MedGemma receives a radiologist assistant prompt asking it to analyze the image and return a JSON result.

---

### CT / MRI Analysis

Input can be any of these formats — the code tries them in order:

**1. ZIP archive** (most common for hospital exports)

Hospital CDs typically contain a `DICOM/` folder with files named `IM0001`, `IM0002` etc. with no extension. The code:
- First looks for `.dcm` files
- Then looks for extensionless files whose bytes 128–131 spell `DICM` (the DICOM magic header)
- Falls back to plain JPEG/PNG images inside the ZIP

If the ZIP contains multiple scan series (common — scout + axial + coronal + sagittal), it **automatically picks the largest series**, which is always the main diagnostic axial series.

**2. Single DICOM file** — decoded with `pydicom`, pixel values converted to Hounsfield Units (HU) using the `RescaleSlope`/`RescaleIntercept` tags from the DICOM header.

**3. Single JPEG / PNG** — opened directly with PIL.

### CT Preprocessing — 3-Channel HU Windowing

Raw CT pixel values (HU) are converted into a **colour image** using three clinical windowing presets, one per colour channel. This is the same technique from Google's official MedGemma notebooks.

| Channel | Window | What it highlights |
|---------|--------|--------------------|
| Red | WL 0, WW 2048 (wide) | Entire anatomy — bones, air, tissue |
| Green | WL 40, WW 350 (soft tissue) | Muscles, organs, fat |
| Blue | WL 40, WW 80 (brain) | Brain parenchyma, subtle bleeds |

This gives MedGemma a single RGB image that simultaneously encodes three levels of detail.

### MRI Preprocessing

MRI pixel values are min-max normalized across the entire volume (0–255), then converted to a greyscale RGB image.

### Slice Sampling and Montage

From a full CT/MRI volume (which can be 100+ slices), **4 evenly-spaced slices** are picked. These 4 are scaled to 448×448 px each and stacked **vertically into one tall image (448×1792)**, which is sent to MedGemma as a single image.

Why one image? MedGemma 4B was fine-tuned on single-image tasks. Passing multiple images causes it to refuse with "I am a text-based AI and cannot process medical images." Stacking them into a montage sidesteps this limitation while still giving the model spatial coverage of the scan.

The inference canvas (exactly what MedGemma saw) is saved to Cloudinary separately so it can be audited later.

---

### PDF / Lab Report Analysis

PDFs go to Flask on Kaggle, not to MedGemma. Two paths are chosen automatically:

**Text path** — if `pdfplumber` extracts ≥ 50 characters of text, the text is sent to GPT (cheap and fast). Used for native digital PDFs.

**Vision path** — if the PDF has no readable text (scanned or photographed document), each page is rendered to JPEG at 144 DPI using `pypdfium2` and sent to GPT as images. Up to 10 pages are processed.

---

### JSON Result — Same Shape for All Types

All three paths (X-ray, CT/MRI, PDF) return the same JSON structure:

```json
{
  "summary":          "2-3 sentence plain-language description of what was found",
  "findings":         ["Finding 1", "Finding 2"],
  "flagged_abnormal": false,
  "impression":       "Overall clinical impression"
}
```

`flagged_abnormal` is `true` only when clearly pathological findings are present (e.g. consolidation, effusion, mass, fracture, haemorrhage). A normal or unremarkable scan returns `false`.

CT/MRI results also include `modality` ("CT" or "MRI") and `model_used` ("medgemma-1.5-4b"). These are stored in the MongoDB `ImageUpload` document alongside the result.

---

## RAG Knowledge Bases

The system uses three FAISS vector indexes built from medical text corpora.

| Index | Content | Used for |
|-------|---------|---------|
| `clinician_index` | Medical textbooks + clinical guidelines | Evidence-based context for the doctor report and diagnosis |
| `patient_index` | Wikidoc patient-facing medical articles | Patient-friendly explanations in the patient summary |
| `disease_index` | Disease descriptions (symptoms, typical presentations) | Ranking differential diagnosis candidates |

Indexes are pre-built and stored in two Kaggle datasets (`uresense-rag-index` and `curesense-disease-index`). The notebook copies them into the working directory at startup — no rebuild needed unless the corpus changes.

Embeddings use `BAAI/bge-small-en-v1.5` (384-dimensional, optimized for retrieval, runs on GPU).

Medication information (drug interactions, warnings, dosage) is fetched live from the **openFDA API** at report generation time — it is not stored in the FAISS index because drug labels change frequently.

---

## Models Used

| Model | Where it runs | Purpose |
|-------|--------------|---------|
| `gpt-5.6-luna` (low reasoning) | OpenAI API | Interview turns, entity verification, all report generation |
| Whisper Large | Kaggle GPU | Voice message transcription + translation |
| GLiNER BioMed (`Ihor/gliner-biomed-bi-large-v1.0`) | Kaggle GPU | Named entity extraction from transcript |
| `BAAI/bge-small-en-v1.5` | Kaggle GPU | Text embeddings for FAISS similarity search |
| MedGemma 1.5-4B (`google/medgemma-1.5-4b-it`) | Colab T4 GPU | Medical image analysis (X-ray, CT, MRI) |

---

## Environment Variables (Backend `.env`)

```
AI_SERVICE_URL=https://<your-ngrok-url>       # Flask on Kaggle
MEDGEMMA_SERVICE_URL=https://<your-ngrok-url> # FastAPI on Colab
```

Both URLs change every time you restart the notebooks. After running Cell 9 (Kaggle) and the Colab tunnel cell, copy the printed URLs and restart the Express server.

---

## Kaggle Secrets Required

| Secret name | Value |
|---|---|
| `Ngrok Key` | Your ngrok auth token |
| `OpenAI Key` | Your OpenAI API key |

Set these in **Kaggle notebook → Settings → Secrets** before running Cell 3.
