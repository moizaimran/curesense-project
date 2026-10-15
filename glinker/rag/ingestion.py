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

# ── Main build function ───────────────────────────────────────────────────────

def _save_index(chunks: list[dict], index_dir: str, name: str,
                embed_batch: int = 512) -> int:
    """
    Embed chunks and build FAISS IndexFlatIP incrementally.

    Vectors are added to FAISS one embed_batch at a time and the numpy
    array is deleted immediately after each add — peak RAM stays constant
    regardless of total corpus size:

        peak ≈ FAISS accumulated (3KB/vec) + 1 batch (~150MB for 512 chunks)

    This allows corpora of several million chunks to build on Kaggle (29GB RAM)
    without OOM. The old approach (embed all → add all) would hold two full
    numpy arrays simultaneously, doubling RAM usage at the worst moment.

    Returns vector count added to the index.
    """
    if not chunks:
        print(f"[ingestion] No chunks for {name} — skipping.")
        return 0

    total = len(chunks)
    print(f"\n[{name}] Embedding {total:,} chunks (batch={embed_batch}) …")

    model = config.get_embed_model()
    index = None   # created on first batch so we know the embedding dim

    for i in range(0, total, embed_batch):
        batch       = chunks[i : i + embed_batch]
        texts       = [c["text"] for c in batch]
        vecs        = model.encode(texts, show_progress_bar=False,
                                   normalize_embeddings=True)
        vecs        = np.array(vecs, dtype="float32")
        faiss.normalize_L2(vecs)   # redundant when normalize_embeddings=True, kept for safety

        if index is None:
            index = faiss.IndexFlatIP(vecs.shape[1])

        index.add(vecs)
        del vecs   # free batch immediately — keeps peak RAM low

        done = min(i + embed_batch, total)
        if done % 10_000 == 0 or done == total:
            print(f"  [{name}] {done:,}/{total:,} embedded | index size: {index.ntotal:,}")

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
    textbooks_limit : int | None = None,
    guidelines_limit: int | None = None,
) -> bool:
    """
    Build the single clinician FAISS index and save to config.RAG_INDEX_DIR.

    Sources: MedRAG/textbooks + clinician/mixed guidelines.
    The separate patient index was removed — the patient summary LLM now
    receives clinician chunks and is prompted to write in plain language,
    which is more reliable than a separate wikidoc corpus that rarely
    returned relevant chunks above threshold.

    *_limit params cap entries for quick testing; leave as None for full corpus.
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

    # Clinician index: textbooks + clinician/mixed guidelines
    clinician_chunks = textbook_chunks + [
        c for c in guideline_chunks
        if c["metadata"].get("audience") in ("clinician", "mixed")
    ]

    print(f"\n[Build] {len(clinician_chunks):,} clinician chunks to index.")

    n_clinician = _save_index(clinician_chunks, index_dir, "clinician")
    print(f"\n✅ Done — clinician index: {n_clinician:,} vectors")
    return n_clinician > 0
