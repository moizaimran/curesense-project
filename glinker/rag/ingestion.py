# ==============================================================================
# glinker/rag/ingestion.py
#
# One-time knowledge-base build.
#
# Loads two HuggingFace datasets that form the complete, static corpus:
#   • MedRAG/textbooks   — medical textbooks (pathophysiology, clinical reasoning)
#   • epfl-llm/guidelines — clinical practice guidelines
#
# Chunks the text, embeds with text-embedding-3-small, builds a FAISS
# IndexFlatIP (cosine similarity via L2-normalised vectors) and saves to disk.
#
# Re-run ONLY when you want to refresh the knowledge base.
# At runtime the pipeline loads the saved index via retrieval.load_index().
# ==============================================================================
import os
import json
import re

import numpy as np
import faiss
import tiktoken

from glinker import config

CHUNK_TOKENS   = 600
OVERLAP_TOKENS = 100

_enc = tiktoken.get_encoding("cl100k_base")

# ── Audience mapping for guidelines (matched as substring of source field) ────
_GUIDELINE_AUDIENCE: dict[str, str] = {
    "nice"   : "clinician",
    "cdc"    : "clinician",
    "cma"    : "clinician",
    "icrc"   : "clinician",
    "cco"    : "clinician",
    "spor"   : "clinician",
    "pubmed" : "clinician",
    "wikidoc": "patient",
    "who"    : "mixed",
}

def _guideline_audience(source: str) -> str:
    """Return audience tag for a guideline by substring-matching its source field."""
    src = source.lower()
    for key, tag in _GUIDELINE_AUDIENCE.items():
        if key in src:
            return tag
    return "clinician"   # unknown sources default to clinician


# ── Text chunking ─────────────────────────────────────────────────────────────

def _token_len(text: str) -> int:
    return len(_enc.encode(text))


def chunk_text(text: str, meta: dict) -> list[dict]:
    """Split text into overlapping token-bounded chunks at sentence boundaries."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks, buf, buf_toks = [], [], 0

    for sent in sentences:
        t = _token_len(sent)
        if buf_toks + t > CHUNK_TOKENS and buf:
            chunk_str = ' '.join(buf).strip()
            if chunk_str:
                chunks.append({"text": chunk_str, "metadata": {**meta, "chunk_idx": len(chunks)}})
            while buf and buf_toks > OVERLAP_TOKENS:
                removed = buf.pop(0)
                buf_toks -= _token_len(removed)
        buf.append(sent)
        buf_toks += t

    if buf:
        chunk_str = ' '.join(buf).strip()
        if chunk_str:
            chunks.append({"text": chunk_str, "metadata": {**meta, "chunk_idx": len(chunks)}})
    return chunks


# ── Dataset loaders ───────────────────────────────────────────────────────────

def _chunks_from_textbooks(max_entries: int | None = None) -> list[dict]:
    """
    Load MedRAG/textbooks and convert to chunks.
    Each entry is expected to have at least a 'content' field.
    Common additional fields used for metadata: 'title', 'id'.
    """
    from datasets import load_dataset
    print("Loading MedRAG/textbooks …")
    ds = load_dataset("MedRAG/textbooks", split="train")
    print(f"  {len(ds):,} entries found")

    # Inspect schema on first entry
    sample = ds[0]
    text_field = next(
        (f for f in ["content", "text", "passage", "body"] if f in sample),
        None,
    )
    if text_field is None:
        raise ValueError(f"Cannot find text field in MedRAG/textbooks. Keys: {list(sample.keys())}")

    all_chunks = []
    entries = ds if max_entries is None else ds.select(range(min(max_entries, len(ds))))
    for i, entry in enumerate(entries):
        text = entry.get(text_field, "").strip()
        if not text or len(text) < 50:
            continue
        meta = {
            "source"  : entry.get("id", f"textbook_{i}"),
            "doc_type": "textbook",
            "title"   : entry.get("title", ""),
            "audience": "clinician",
        }
        all_chunks.extend(chunk_text(text, meta))
        if (i + 1) % 5000 == 0:
            print(f"  Processed {i+1:,} textbook entries ({len(all_chunks):,} chunks so far)")

    print(f"  → {len(all_chunks):,} chunks from textbooks")
    return all_chunks


def _chunks_from_guidelines(max_entries: int | None = None) -> list[dict]:
    """
    Load epfl-llm/guidelines and convert to chunks.
    Each entry is expected to have at least a 'clean_text' or 'text' field.
    """
    from datasets import load_dataset
    print("Loading epfl-llm/guidelines …")
    ds = load_dataset("epfl-llm/guidelines", split="train")
    print(f"  {len(ds):,} entries found")

    sample = ds[0]
    text_field = next(
        (f for f in ["clean_text", "text", "content", "body"] if f in sample),
        None,
    )
    if text_field is None:
        raise ValueError(f"Cannot find text field in epfl-llm/guidelines. Keys: {list(sample.keys())}")

    all_chunks = []
    entries = ds if max_entries is None else ds.select(range(min(max_entries, len(ds))))
    for i, entry in enumerate(entries):
        text = entry.get(text_field, "").strip()
        if not text or len(text) < 50:
            continue
        source = entry.get("id", entry.get("url", f"guideline_{i}"))
        meta = {
            "source"  : source,
            "doc_type": "guideline",
            "title"   : entry.get("title", entry.get("name", "")),
            "audience": _guideline_audience(source),
        }
        all_chunks.extend(chunk_text(text, meta))
        if (i + 1) % 2000 == 0:
            print(f"  Processed {i+1:,} guideline entries ({len(all_chunks):,} chunks so far)")

    print(f"  → {len(all_chunks):,} chunks from guidelines")
    return all_chunks


# ── Embedding ─────────────────────────────────────────────────────────────────

def _embed_chunks(chunks: list[dict], batch_size: int = 512) -> np.ndarray:
    """Embed all chunks locally with sentence-transformers (free, GPU-accelerated)."""
    model  = config.get_embed_model()
    texts  = [c["text"] for c in chunks]
    total  = len(texts)
    all_vecs = []
    for i in range(0, total, batch_size):
        batch = texts[i : i + batch_size]
        vecs  = model.encode(batch, show_progress_bar=False, normalize_embeddings=True)
        all_vecs.extend(vecs.tolist())
        done = min(i + batch_size, total)
        if done % 2000 == 0 or done == total:
            print(f"  Embedded {done:,}/{total:,} chunks")
    return np.array(all_vecs, dtype="float32")


# ── Main build function ───────────────────────────────────────────────────────

def _save_index(chunks: list[dict], index_dir: str, name: str) -> int:
    """Embed chunks, build FAISS IndexFlatIP, save .faiss + _meta.json. Returns vector count."""
    if not chunks:
        print(f"[ingestion] No chunks for {name} — skipping.")
        return 0
    print(f"\n[{name}] Embedding {len(chunks):,} chunks …")
    matrix = _embed_chunks(chunks)
    faiss.normalize_L2(matrix)
    index = faiss.IndexFlatIP(matrix.shape[1])
    index.add(matrix)
    faiss.write_index(index, f"{index_dir}/{name}_index.faiss")
    with open(f"{index_dir}/{name}_meta.json", "w") as f:
        json.dump(
            {
                "chunks"  : [c["text"]     for c in chunks],
                "metadata": [c["metadata"] for c in chunks],
            },
            f,
        )
    print(f"✅ {name} index saved — {index.ntotal:,} vectors | {index_dir}/{name}_index.faiss")
    return index.ntotal


def build_index(
    textbooks_limit: int | None = None,
    guidelines_limit: int | None = None,
) -> bool:
    """
    Build two audience-split FAISS indexes and save to config.RAG_INDEX_DIR:
      clinician_index — MedRAG/textbooks + clinician guidelines + mixed (WHO) guidelines
      patient_index   — patient (wikidoc) guidelines + mixed (WHO) guidelines

    textbooks_limit / guidelines_limit: cap entries for quick testing.
    Leave both as None for the full corpus.
    """
    index_dir = config.RAG_INDEX_DIR
    os.makedirs(index_dir, exist_ok=True)

    # ── Load datasets ────────────────────────────────────────────────────────
    textbook_chunks, guideline_chunks = [], []
    try:
        textbook_chunks = _chunks_from_textbooks(max_entries=textbooks_limit)
    except Exception as e:
        print(f"[ingestion] textbooks failed: {e}")

    try:
        guideline_chunks = _chunks_from_guidelines(max_entries=guidelines_limit)
    except Exception as e:
        print(f"[ingestion] guidelines failed: {e}")

    if not textbook_chunks and not guideline_chunks:
        print("[ingestion] No chunks produced — check dataset access.")
        return False

    # ── Split by audience tag (mixed goes into both) ─────────────────────────
    clinician_chunks = textbook_chunks + [
        c for c in guideline_chunks
        if c["metadata"].get("audience") in ("clinician", "mixed")
    ]
    patient_chunks = [
        c for c in guideline_chunks
        if c["metadata"].get("audience") in ("patient", "mixed")
    ]

    print(f"\nSplit: {len(clinician_chunks):,} clinician chunks | {len(patient_chunks):,} patient chunks")

    # ── Build and save each index ────────────────────────────────────────────
    n_clinician = _save_index(clinician_chunks, index_dir, "clinician")
    n_patient   = _save_index(patient_chunks,   index_dir, "patient")

    print(f"\n✅ Done — clinician: {n_clinician:,} vectors | patient: {n_patient:,} vectors")
    return n_clinician > 0
