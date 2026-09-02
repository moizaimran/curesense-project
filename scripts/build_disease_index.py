# ==============================================================================
# scripts/build_disease_index.py
#
# ONE-TIME setup script — run in Kaggle once, then upload the output as a
# Kaggle dataset so future sessions skip the build entirely (2-3 sec copy).
#
# Sources:
#   1. ICD-10-CM (CDC FTP)  — official disease codes + descriptions
#   2. HPO                  — disease → symptoms with frequency data
#
# Note: MedlinePlus enrichment is not included yet — can be added later as a
# separate enrichment pass on top of the saved disease_meta.json.
#
# Output:
#   /kaggle/working/disease_index/disease_index.faiss
#   /kaggle/working/disease_index/disease_meta.json
#
# Usage:
#   from scripts.build_disease_index import build_disease_index
#   build_disease_index()
# ==============================================================================

import json
import os
import zipfile
from collections import defaultdict
from io import BytesIO

import faiss
import numpy as np
import requests

# ── Constants ──────────────────────────────────────────────────────────────────

OUTPUT_DIR      = "/kaggle/working/disease_index"
EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"   # must match glinker/config.py

HPO_FREQ = {
    "HP:0040281": "very frequent",
    "HP:0040282": "frequent",
    "HP:0040283": "occasional",
    "HP:0040284": "rare",
    "HP:0040285": "very rare",
}


# ==============================================================================
# STEP 1 — ICD-10-CM  (CDC FTP — stable direct text file, no zip)
# ==============================================================================

def _load_icd10() -> dict[str, str]:
    """
    Download ICD-10-CM codes from CDC FTP.
    Returns {code: description}, e.g. {"K58.9": "Irritable bowel syndrome..."}

    Primary: CDC FTP direct .txt (stable, no zip, consistent URL).
    Fallback: CMS zip (year-specific, internal filename varies).
    """
    primary_urls = [
        "https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Publications/ICD10CM/2025/icd10cm_codes_2025.txt",
        "https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Publications/ICD10CM/2024/icd10cm_codes_2024.txt",
    ]
    fallback_urls = [
        "https://www.cms.gov/files/zip/2025-icd-10-cm-codes.zip",
        "https://www.cms.gov/files/zip/2024-icd-10-cm-codes.zip",
    ]

    raw_text = None

    for url in primary_urls:
        try:
            print(f"[ICD-10] Trying {url} ...")
            r = requests.get(url, timeout=60)
            if r.ok:
                raw_text = r.text
                print("[ICD-10] Downloaded from CDC FTP.")
                break
        except Exception as e:
            print(f"[ICD-10] CDC URL failed: {e}")

    if raw_text is None:
        for url in fallback_urls:
            try:
                print(f"[ICD-10] Trying CMS zip: {url} ...")
                r = requests.get(url, timeout=60)
                if r.ok:
                    with zipfile.ZipFile(BytesIO(r.content)) as z:
                        candidates = [
                            n for n in z.namelist()
                            if n.endswith(".txt") and "code" in n.lower()
                        ]
                        if not candidates:
                            candidates = [n for n in z.namelist() if n.endswith(".txt")]
                        if candidates:
                            with z.open(candidates[0]) as f:
                                raw_text = f.read().decode("utf-8", errors="ignore")
                            print(f"[ICD-10] Downloaded from CMS zip ({candidates[0]}).")
                            break
            except Exception as e:
                print(f"[ICD-10] CMS URL failed: {e}")

    if raw_text is None:
        print("[ICD-10] WARNING: Could not download ICD-10-CM. Continuing without it.")
        return {}

    codes: dict[str, str] = {}
    for line in raw_text.splitlines():
        line = line.strip()
        if not line or len(line) < 4:
            continue
        parts = line.split(None, 1)
        if len(parts) != 2:
            continue
        code, desc = parts[0].strip(), parts[1].strip()
        # Insert decimal dot: "K589" → "K58.9"  (CDC stores codes without dots)
        if len(code) > 3 and "." not in code:
            code = code[:3] + "." + code[3:]
        if code and desc:
            codes[code] = desc

    print(f"[ICD-10] {len(codes):,} codes loaded.")
    return codes


# ==============================================================================
# STEP 2 — HPO
# ==============================================================================

def _load_hpo_terms() -> dict[str, str]:
    """Download hp.obo and return {HP:XXXXXXX → symptom_name}."""
    print("[HPO] Downloading hp.obo ...")
    urls = [
        "https://purl.obolibrary.org/obo/hp.obo",
        "https://github.com/obophenotype/human-phenotype-ontology/releases/latest/download/hp.obo",
    ]
    raw = None
    for url in urls:
        try:
            r = requests.get(url, timeout=180)
            if r.ok:
                raw = r.text
                break
        except Exception as e:
            print(f"[HPO] hp.obo URL failed: {e}")

    if not raw:
        print("[HPO] WARNING: Could not download hp.obo.")
        return {}

    terms: dict[str, str] = {}
    current_id = None
    for line in raw.splitlines():
        if line.startswith("id: HP:"):
            current_id = line[4:].strip()   # "id: " is 4 chars → gives "HP:0000001"
        elif line.startswith("name: ") and current_id:
            terms[current_id] = line[6:].strip()
            current_id = None

    print(f"[HPO] {len(terms):,} phenotype terms loaded.")
    return terms


def _load_hpo_annotations(hpo_terms: dict[str, str]) -> dict[str, list[tuple[str, str]]]:
    """
    Download phenotype.hpoa and return
    {disease_name → [(symptom_name, frequency_label), ...]}

    The DatabaseID column is "OMIM:619340" (full ID, not just "OMIM").
    Must use startswith() — equality check skips everything.
    """
    print("[HPO] Downloading phenotype.hpoa ...")
    urls = [
        "https://purl.obolibrary.org/obo/hp/hpoa/phenotype.hpoa",
        "https://github.com/obophenotype/human-phenotype-ontology/releases/latest/download/phenotype.hpoa",
    ]
    raw = None
    for url in urls:
        try:
            r = requests.get(url, timeout=180)
            if r.ok:
                raw = r.text
                break
        except Exception as e:
            print(f"[HPO] phenotype.hpoa URL failed: {e}")

    if not raw:
        print("[HPO] WARNING: Could not download phenotype.hpoa.")
        return {}

    disease_map: dict[str, list[tuple[str, str]]] = defaultdict(list)
    skipped = 0

    for line in raw.splitlines():
        if line.startswith("#"):
            continue
        cols = line.split("\t")
        if len(cols) < 9:
            skipped += 1
            continue

        db_id        = cols[0]   # e.g. "OMIM:619340"
        disease_name = cols[1]   # e.g. "IRRITABLE BOWEL SYNDROME"
        qualifier    = cols[2]   # "NOT" means absence — skip
        hpo_id       = cols[3]   # e.g. "HP:0002014"
        frequency    = cols[7]   # e.g. "HP:0040281" or empty

        if qualifier.strip() == "NOT":
            continue

        # db_id is the full "OMIM:619340", not just "OMIM"
        if not db_id.startswith(("OMIM:", "ORPHA:")):
            continue

        symptom = hpo_terms.get(hpo_id.strip())
        if not symptom:
            continue

        freq_label  = HPO_FREQ.get(frequency.strip(), "")
        disease_key = disease_name.strip().title()
        disease_map[disease_key].append((symptom, freq_label))

    if skipped:
        print(f"[HPO] Skipped {skipped} malformed lines.")
    print(f"[HPO] {len(disease_map):,} diseases with phenotype annotations.")
    return dict(disease_map)


# ==============================================================================
# STEP 3 — ICD-10 fuzzy matching
# ==============================================================================

def _build_icd10_reverse(icd10: dict[str, str]) -> dict[str, tuple[str, str]]:
    """
    Reverse lookup: {description_lower → (code, description_original)}.
    Enables O(1) lookup after rapidfuzz finds the best match string.
    """
    return {desc.lower(): (code, desc) for code, desc in icd10.items()}


def _match_icd10(
    disease_name : str,
    icd_keys     : list[str],
    icd_reverse  : dict[str, tuple[str, str]],
    threshold    : int = 78,
) -> tuple[str, str]:
    """Fuzzy-match a disease name to ICD-10. Returns (code, description) or ('', '')."""
    try:
        from rapidfuzz import fuzz, process
        result = process.extractOne(
            disease_name.lower(),
            icd_keys,
            scorer=fuzz.token_sort_ratio,
            score_cutoff=threshold,
        )
        if result:
            code, desc = icd_reverse[result[0]]
            return code, desc
    except ImportError:
        pass
    return "", ""


# ==============================================================================
# STEP 4 — Build paragraph
# ==============================================================================

def _build_paragraph(
    disease_name : str,
    icd_code     : str,
    icd_desc     : str,
    phenotypes   : list[tuple[str, str]],
) -> str:
    parts = [f"Disease: {disease_name}."]

    if icd_code:
        parts.append(f"ICD-10 code: {icd_code}.")

    if phenotypes:
        by_freq: dict[str, list[str]] = defaultdict(list)
        for symptom, freq in phenotypes:
            by_freq[freq or "known symptom"].append(symptom)

        freq_order = ["very frequent", "frequent", "occasional", "rare", "known symptom"]
        sym_parts  = []
        for fl in freq_order:
            syms = by_freq.get(fl)
            if syms:
                sym_parts.append(f"{fl}: {', '.join(syms[:10])}")
        if sym_parts:
            parts.append("Symptoms (" + "; ".join(sym_parts) + ").")

    if icd_desc:
        parts.append(f"Description: {icd_desc}.")

    return " ".join(parts)


# ==============================================================================
# STEP 5 — Embed and save
# ==============================================================================

def _embed_and_save(paragraphs: list[str], metadata: list[dict]) -> None:
    from sentence_transformers import SentenceTransformer

    print(f"\n[Embed] Loading {EMBEDDING_MODEL} ...")
    model = SentenceTransformer(EMBEDDING_MODEL)

    print(f"[Embed] Encoding {len(paragraphs):,} paragraphs (batch=128) ...")
    vectors = model.encode(
        paragraphs,
        batch_size=128,
        normalize_embeddings=True,
        show_progress_bar=True,
    )
    vectors = np.array(vectors, dtype="float32")

    dim   = vectors.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(vectors)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    faiss.write_index(index, f"{OUTPUT_DIR}/disease_index.faiss")
    with open(f"{OUTPUT_DIR}/disease_meta.json", "w") as f:
        json.dump({"paragraphs": paragraphs, "metadata": metadata}, f)

    print(f"\n✅ Disease index saved → {OUTPUT_DIR}/")
    print(f"   Vectors : {index.ntotal:,}  |  Dim : {dim}")
    print("\nNext step: download these 2 files and upload as Kaggle dataset 'curesense-disease-index'")
    print(f"  {OUTPUT_DIR}/disease_index.faiss")
    print(f"  {OUTPUT_DIR}/disease_meta.json")


# ==============================================================================
# MAIN
# ==============================================================================

def build_disease_index(
    icd_match_threshold: int = 78,
    min_symptoms       : int = 1,
) -> None:
    """
    Full pipeline: download → parse → merge → embed → save.
    Estimated time: ~5-8 minutes (HPO download ~2 min, ICD-10 ~1 min, FAISS ~2 min).
    """
    print("=" * 60)
    print("CureSense — Building disease knowledge base")
    print("Sources : HPO + ICD-10-CM")
    print("=" * 60 + "\n")

    # ── 1. ICD-10-CM ─────────────────────────────────────────────────────────
    icd10       = _load_icd10()
    icd_reverse = _build_icd10_reverse(icd10)
    icd_keys    = list(icd_reverse.keys())

    # ── 2. HPO ───────────────────────────────────────────────────────────────
    hpo_terms    = _load_hpo_terms()
    hpo_diseases = _load_hpo_annotations(hpo_terms)

    # ── 3. Master disease list ────────────────────────────────────────────────
    all_diseases: dict[str, dict] = {}

    for disease_name, phenotypes in hpo_diseases.items():
        if len(phenotypes) >= min_symptoms:
            all_diseases[disease_name] = {"phenotypes": phenotypes, "source": "hpo"}

    # Add ICD-10 category codes not already covered by HPO
    existing_lower = {k.lower() for k in all_diseases}
    for code, desc in icd10.items():
        if desc.lower() in existing_lower:
            continue
        if "." not in code:   # 3-char category codes only (e.g. K58, not K58.9)
            all_diseases[desc] = {"phenotypes": [], "source": "icd10", "icd_code": code}
            existing_lower.add(desc.lower())

    disease_list = list(all_diseases.items())
    print(f"\n[Merge] {len(disease_list):,} total diseases to process.\n")

    # ── 4. Build paragraphs ───────────────────────────────────────────────────
    paragraphs : list[str]  = []
    metadata   : list[dict] = []
    skipped = 0

    for i, (disease_name, info) in enumerate(disease_list):
        phenotypes = info.get("phenotypes", [])

        icd_code = info.get("icd_code", "")
        icd_desc = ""
        if not icd_code and icd_keys:
            icd_code, icd_desc = _match_icd10(disease_name, icd_keys, icd_reverse, icd_match_threshold)
        elif icd_code and icd_code in icd10:
            icd_desc = icd10[icd_code]

        has_symptoms = len(phenotypes) >= min_symptoms
        has_icd_desc = bool(icd_desc)
        if not has_symptoms and not has_icd_desc:
            skipped += 1
            continue

        paragraph = _build_paragraph(disease_name, icd_code, icd_desc, phenotypes)
        paragraphs.append(paragraph)
        metadata.append({
            "disease" : disease_name,
            "icd_code": icd_code,
            "icd_desc": icd_desc,
            "has_hpo" : len(phenotypes) > 0,
            "symptoms": [s for s, _ in phenotypes[:15]],
        })

        if (i + 1) % 500 == 0:
            print(f"  [{i+1:>5}/{len(disease_list)}]  built={len(paragraphs):,}  skipped={skipped}")

    print(f"\n[Build] {len(paragraphs):,} disease paragraphs ready  ({skipped} skipped).")

    # ── 5. Embed + save ───────────────────────────────────────────────────────
    _embed_and_save(paragraphs, metadata)


if __name__ == "__main__":
    build_disease_index()
