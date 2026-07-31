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
        meta = {
            "source"  : entry.get("id", entry.get("url", f"guideline_{i}")),
            "doc_type": "guideline",
            "title"   : entry.get("title", entry.get("name", "")),
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

def build_index(
    textbooks_limit: int | None = None,
    guidelines_limit: int | None = None,
) -> bool:
    """
    Load both datasets, embed, build FAISS IndexFlatIP, and save to
    config.RAG_INDEX_DIR. Returns True on success.

    textbooks_limit / guidelines_limit: cap entries for quick testing.
    Leave both as None for the full corpus.
    """
    index_dir = config.RAG_INDEX_DIR
    os.makedirs(index_dir, exist_ok=True)

    # ── Load datasets ────────────────────────────────────────────────────────
    all_chunks = []
    try:
        all_chunks.extend(_chunks_from_textbooks(max_entries=textbooks_limit))
    except Exception as e:
        print(f"[ingestion] textbooks failed: {e}")

    try:
        all_chunks.extend(_chunks_from_guidelines(max_entries=guidelines_limit))
    except Exception as e:
        print(f"[ingestion] guidelines failed: {e}")

    if not all_chunks:
        print("[ingestion] No chunks produced — check dataset access.")
        return False

    print(f"\nTotal chunks: {len(all_chunks):,}")

    # ── Embed ────────────────────────────────────────────────────────────────
    print("\nEmbedding …")
    matrix = _embed_chunks(all_chunks)

    # ── Build FAISS index ────────────────────────────────────────────────────
    print("\nBuilding FAISS IndexFlatIP …")
    faiss.normalize_L2(matrix)
    index = faiss.IndexFlatIP(matrix.shape[1])
    index.add(matrix)

    # ── Save ─────────────────────────────────────────────────────────────────
    faiss.write_index(index, f"{index_dir}/index.faiss")
    with open(f"{index_dir}/chunks.json", "w") as f:
        json.dump(
            {
                "chunks"  : [c["text"]     for c in all_chunks],
                "metadata": [c["metadata"] for c in all_chunks],
            },
            f,
        )

    print(
        f"\n✅ Index saved — {index.ntotal:,} vectors, dim={matrix.shape[1]}\n"
        f"   Location: {index_dir}/"
    )
    return True
