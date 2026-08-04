# ==============================================================================
# glinker/disease/ranker.py
#
# Symptom-to-disease ranking using TF-IDF (+ optional BioBERT rerank).
#
# Usage:
#   from glinker.disease.ranker import load_datasets, rank_diseases
#   load_datasets()        # call once at startup
#   rank_diseases(entities, summary)
#
# ADD THESE DATASETS via Kaggle "Add Data" before running:
#   1. abhishekgodara/symptoms-to-diseases
#   2. itachi9604/disease-symptom-description-dataset
#   3. dhivyeshrk/diseases-and-symptoms-dataset
#   4. kaushil268/disease-prediction-using-machine-learning
#   5. manncodes/drug-prescription-to-disease-dataset
#   6. uom190346a/disease-symptoms-and-patient-profile-dataset
#   7. choongqianzheng/disease-and-symptoms-dataset
#   8. nautiyalayush/disease-prediction-using-symptoms
#   9. shobhit043/diseases-and-their-symptoms
#
# If no datasets are attached, DISEASE_RANKER_READY stays False and
# rank_diseases() returns [] — the pipeline continues without ranking.
# ==============================================================================
import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# ── Module-level state ────────────────────────────────────────────────────────
_df               = None
_vectorizer       = None
_tfidf_matrix     = None
DISEASE_RANKER_READY = False

USE_BIOBERT = False   # set True for higher accuracy (~1-2 min extra load, ~400 MB GPU)
_biobert    = None
_bio_tok    = None

# ── Medicine → condition hint map ─────────────────────────────────────────────
MEDICINE_DISEASE_MAP = {
    'amoxicillin'   : 'bacterial infection',
    'azithromycin'  : 'respiratory infection',
    'ciprofloxacin' : 'bacterial infection urinary tract',
    'metronidazole' : 'gastroenteritis anaerobic infection',
    'doxycycline'   : 'bacterial infection chlamydia',
    'penicillin'    : 'bacterial infection streptococcal',
    'ibuprofen'     : 'pain inflammation fever',
    'paracetamol'   : 'pain fever',
    'aspirin'       : 'pain fever cardiovascular',
    'omeprazole'    : 'acid reflux gastritis peptic ulcer',
    'pantoprazole'  : 'acid reflux gastritis',
    'metformin'     : 'type 2 diabetes',
    'insulin'       : 'diabetes',
    'losartan'      : 'hypertension',
    'amlodipine'    : 'hypertension angina',
    'atorvastatin'  : 'hypercholesterolemia cardiovascular',
    'metoprolol'    : 'hypertension heart failure',
    'lisinopril'    : 'hypertension heart failure',
    'salbutamol'    : 'asthma bronchospasm',
    'montelukast'   : 'asthma allergic rhinitis',
    'cetirizine'    : 'allergy rhinitis urticaria',
    'loratadine'    : 'allergy rhinitis',
    'prednisolone'  : 'inflammation allergy asthma',
    'diclofenac'    : 'pain inflammation arthritis',
    'tramadol'      : 'moderate severe pain',
    'codeine'       : 'pain cough',
    'fluoxetine'    : 'depression anxiety',
    'sertraline'    : 'depression anxiety',
    'amitriptyline' : 'depression neuropathic pain',
    'levothyroxine' : 'hypothyroidism',
    'warfarin'      : 'atrial fibrillation deep vein thrombosis',
    'clopidogrel'   : 'cardiovascular disease stroke prevention',
}


# ── Internal helpers ──────────────────────────────────────────────────────────

def _find_col(columns, *keywords, default_idx=0):
    """Return the first column name containing any keyword substring; fall back to columns[default_idx]."""
    for kw in keywords:
        match = next((c for c in columns if kw in c), None)
        if match:
            return match
    return columns[default_idx]


def _join_symptom_cols(df, disease_col):
    """
    For datasets where symptoms are spread across multiple 'symptom*' columns,
    joins them into a single space-separated symptom_text string per row.
    """
    sym_cols = [c for c in df.columns if 'symptom' in c]
    sym_text = df[sym_cols].fillna('').astype(str).apply(
        lambda col: col.str.strip().str.lower().str.replace('_', ' ')
    ).apply(lambda row: ' '.join(v for v in row if v and v != 'nan'), axis=1)
    return pd.DataFrame({
        'diseases'    : df[disease_col].str.strip().str.lower(),
        'symptom_text': sym_text,
    })


def _join_onehot(raw: pd.DataFrame, disease_col: str) -> pd.DataFrame:
    """Convert one-hot symptom columns into a symptom_text string per row."""
    sym_cols   = [c for c in raw.columns if c != disease_col]
    sym_matrix = raw[sym_cols].astype(str).apply(
        lambda col: col.map(
            lambda v: col.name.replace('_', ' ')
            if v.strip() in ('1', '1.0', 'true', 'yes') else ''
        )
    )
    texts = sym_matrix.apply(lambda row: ' '.join(filter(None, row)), axis=1)
    return pd.DataFrame({
        'diseases'    : raw[disease_col].astype(str).str.strip().str.lower(),
        'symptom_text': texts.str.lower(),
    })


# ── Public API ────────────────────────────────────────────────────────────────

def load_datasets() -> None:
    """
    Load all available Kaggle symptom-disease datasets and build the TF-IDF
    index. Silently skips any dataset that isn't attached to the notebook.
    Sets DISEASE_RANKER_READY = True if at least one dataset loaded.
    """
    global _df, _vectorizer, _tfidf_matrix, DISEASE_RANKER_READY, _biobert, _bio_tok

    frames = []

    # DS1: abhishekgodara/symptoms-to-diseases
    try:
        for fname in ['final_symptoms_to_disease.csv', 'data.csv']:
            p = f'/kaggle/input/datasets/abhishekgodara/symptoms-to-diseases/{fname}'
            r = pd.read_csv(p)
            r.columns = [c.strip().lower() for c in r.columns]
            dc = _find_col(r.columns, 'disease')
            sc = _find_col(r.columns, 'symptom', default_idx=1)
            frames.append(r[[dc, sc]].rename(columns={dc: 'diseases', sc: 'symptom_text'})
                          .astype(str).apply(lambda x: x.str.strip().str.lower()))
        print("✅ DS1 loaded")
    except Exception as e:
        print(f"⬜ DS1 not available ({type(e).__name__})")

    # DS2: itachi9604/disease-symptom-description-dataset
    try:
        r2 = pd.read_csv('/kaggle/input/datasets/itachi9604/disease-symptom-description-dataset/dataset.csv')
        r2.columns = [c.strip().lower() for c in r2.columns]
        dc = _find_col(r2.columns, 'disease')
        frames.append(_join_symptom_cols(r2, dc))
        print("✅ DS2 loaded")
    except Exception as e:
        print(f"⬜ DS2 not available ({type(e).__name__})")

    # DS3: dhivyeshrk/diseases-and-symptoms-dataset
    try:
        r3 = pd.read_csv('/kaggle/input/datasets/dhivyeshrk/diseases-and-symptoms-dataset/Final_Augmented_dataset_Diseases_and_Symptoms.csv')
        r3.columns = [c.strip().lower() for c in r3.columns]
        dc = next((c for c in r3.columns if c in ('disease', 'diseases', 'name')), r3.columns[0])
        frames.append(_join_onehot(r3, dc))
        print("✅ DS3 loaded")
    except Exception as e:
        print(f"⬜ DS3 not available ({type(e).__name__})")

    # DS4: kaushil268/disease-prediction-using-machine-learning
    try:
        r4 = pd.read_csv('/kaggle/input/datasets/kaushil268/disease-prediction-using-machine-learning/Training.csv')
        r4.columns = [c.strip().lower() for c in r4.columns]
        df4 = _join_onehot(r4, 'prognosis')
        df4.columns = ['diseases', 'symptom_text']
        frames.append(df4)
        print("✅ DS4 loaded")
    except Exception as e:
        print(f"⬜ DS4 not available ({type(e).__name__})")

    # DS5: manncodes/drug-prescription-to-disease-dataset
    try:
        r5 = pd.read_csv('/kaggle/input/datasets/manncodes/drug-prescription-to-disease-dataset/final.csv')
        r5.columns = [c.strip().lower() for c in r5.columns]
        dc = _find_col(r5.columns, 'disease', 'condition')
        sc = _find_col(r5.columns, 'drug', 'medicine', 'symptom', 'description', 'text', default_idx=1)
        frames.append(r5[[dc, sc]].rename(columns={dc: 'diseases', sc: 'symptom_text'})
                      .astype(str).apply(lambda x: x.str.strip().str.lower()))
        print("✅ DS5 loaded")
    except Exception as e:
        print(f"⬜ DS5 not available ({type(e).__name__})")

    # DS6: uom190346a/disease-symptoms-and-patient-profile-dataset
    try:
        r6 = pd.read_csv('/kaggle/input/datasets/uom190346a/disease-symptoms-and-patient-profile-dataset/Disease_symptom_and_patient_profile_dataset.csv')
        r6.columns = [c.strip().lower() for c in r6.columns]
        dc = _find_col(r6.columns, 'disease')
        sym_cols = [c for c in r6.columns if c != dc]
        parts = []
        for col in sym_cols:
            vals = r6[col].astype(str).str.strip().str.lower()
            parts.append(col.replace('_', ' ') + ' ' + vals.where(~vals.isin(['nan', '', 'no', '0', 'false']), ''))
        sym_text = pd.concat(parts, axis=1).apply(lambda row: ' '.join(v.strip() for v in row if v.strip()), axis=1)
        frames.append(pd.DataFrame({'diseases': r6[dc].str.strip().str.lower(), 'symptom_text': sym_text.str.lower()}))
        print("✅ DS6 loaded")
    except Exception as e:
        print(f"⬜ DS6 not available ({type(e).__name__})")

    # DS7: choongqianzheng/disease-and-symptoms-dataset
    try:
        r7 = pd.read_csv('/kaggle/input/datasets/choongqianzheng/disease-and-symptoms-dataset/DiseaseAndSymptoms.csv')
        r7.columns = [c.strip().lower() for c in r7.columns]
        dc = _find_col(r7.columns, 'disease')
        frames.append(_join_symptom_cols(r7, dc))
        print("✅ DS7 loaded")
    except Exception as e:
        print(f"⬜ DS7 not available ({type(e).__name__})")

    # DS8: nautiyalayush/disease-prediction-using-symptoms
    try:
        r8 = None
        for enc in ['latin-1', 'iso-8859-1', 'utf-8']:
            try:
                r8 = pd.read_csv('/kaggle/input/datasets/nautiyalayush/disease-prediction-using-symptoms/trainings.csv', encoding=enc)
                break
            except Exception:
                continue
        if r8 is not None:
            r8.columns = [c.strip().lower() for c in r8.columns]
            prog_col = _find_col(r8.columns, 'prognosis', 'disease', default_idx=-1)
            df8 = _join_onehot(r8, prog_col)
            df8.columns = ['diseases', 'symptom_text']
            frames.append(df8)
            print("✅ DS8 loaded")
    except Exception as e:
        print(f"⬜ DS8 not available ({type(e).__name__})")

    # DS9: shobhit043/diseases-and-their-symptoms
    try:
        r9 = pd.read_csv('/kaggle/input/datasets/shobhit043/diseases-and-their-symptoms/FInal_Train_Data.csv')
        r9.columns = [c.strip().lower() for c in r9.columns]
        dc = _find_col(r9.columns, 'disease', 'label')
        df9 = _join_onehot(r9, dc)
        df9.columns = ['diseases', 'symptom_text']
        frames.append(df9)
        print("✅ DS9 loaded")
    except Exception as e:
        print(f"⬜ DS9 not available ({type(e).__name__})")

    if not frames:
        print("\n⬜ No datasets loaded — disease ranking disabled (pipeline runs normally)")
        return

    _df = pd.concat(frames, ignore_index=True).astype(str)
    _df = _df[_df['diseases'].str.len() > 1]
    _df = _df[_df['symptom_text'].str.len() > 3]
    _df = _df[~_df['diseases'].isin(['nan', 'none', ''])]
    _df = _df[~_df['symptom_text'].isin(['nan', 'none', ''])]
    _df = _df.drop_duplicates(subset=['diseases', 'symptom_text']).reset_index(drop=True)

    _vectorizer   = TfidfVectorizer(max_features=30000, ngram_range=(1, 3),
                                    stop_words='english', min_df=1, sublinear_tf=True)
    _tfidf_matrix = _vectorizer.fit_transform(_df['symptom_text'])
    DISEASE_RANKER_READY = True
    print(f"\n✅ TF-IDF ready — {len(_df):,} rows, {_df['diseases'].nunique()} unique diseases")

    if USE_BIOBERT:
        try:
            import torch
            from transformers import AutoTokenizer, AutoModel
            _BIO_MODEL = 'dmis-lab/biobert-base-cased-v1.2'
            _bio_tok   = AutoTokenizer.from_pretrained(_BIO_MODEL)
            _biobert   = AutoModel.from_pretrained(_BIO_MODEL).to(
                torch.device('cuda' if torch.cuda.is_available() else 'cpu'))
            _biobert.eval()
            print("✅ BioBERT loaded for Stage 4 reranking")
        except Exception as e:
            print(f"⬜ BioBERT unavailable ({e}) — TF-IDF only")


def _symptom_overlap(symptom_kws: list[str], symptom_text: str) -> float:
    """
    Fraction of the patient's verified symptom keywords found (substring match)
    in a disease's symptom_text from the dataset.
    Returns 0.0 when symptom_kws is empty.
    """
    if not symptom_kws:
        return 0.0
    text = symptom_text.lower()
    matches = sum(1 for kw in symptom_kws if kw in text)
    return matches / len(symptom_kws)


def rank_diseases(verified_entities: list[dict], clinical_summary: str, top_k: int = 5) -> list[dict]:
    """
    Return top-k disease candidates ranked by a blended score:
      60% TF-IDF cosine similarity  (broad vocabulary match)
      40% symptom keyword overlap   (direct patient-symptom ↔ dataset-symptom match)

    The overlap term re-ranks within the TF-IDF top-25 window, consistently
    favouring diseases whose dataset entries contain the patient's actual symptoms
    over diseases that score high on TF-IDF due to corpus frequency alone.

    Returns [] when DISEASE_RANKER_READY is False.
    """
    if not DISEASE_RANKER_READY:
        return []

    # Only use presenting complaint entities — exclude medication/condition to avoid
    # medication-driven bias (e.g. Losartan skewing results toward kidney disease)
    symptom_cats = {"symptom", "trigger", "body part", "severity", "duration"}
    symptom_kws  = [e["keyword"].lower() for e in verified_entities if e.get("category") in symptom_cats]

    if not symptom_kws:
        return []

    # Build query from symptoms only; strip medication/condition sentences from summary
    summary_sentences = [s for s in clinical_summary.split('.') if not any(
        w in s.lower() for w in ('mg', 'milligram', 'medication', 'drug', 'losartan',
                                  'blood pressure', ' bp', 'allerg', 'dose', 'daily')
    )]
    symptom_summary = '. '.join(summary_sentences[:4])
    query     = ' '.join(symptom_kws) + ' ' + symptom_summary
    query_vec = _vectorizer.transform([query.lower()])
    sims      = cosine_similarity(query_vec, _tfidf_matrix)[0]
    top_idx   = sims.argsort()[-25:][::-1]

    candidates = []
    for idx in top_idx:
        if sims[idx] <= 0:
            continue
        full_text  = _df.iloc[idx]["symptom_text"]
        tfidf_s    = float(sims[idx])
        overlap_s  = _symptom_overlap(symptom_kws, full_text)
        blended    = 0.6 * tfidf_s + 0.4 * overlap_s
        candidates.append({
            "disease"      : _df.iloc[idx]["diseases"],
            "symptom_ref"  : full_text[:120],
            "tfidf_score"  : tfidf_s,
            "overlap_score": overlap_s,
            "blended_score": blended,
        })

    # Deduplicate — keep the highest blended score per disease name
    seen = {}
    for c in candidates:
        d = c["disease"]
        if d not in seen or c["blended_score"] > seen[d]["blended_score"]:
            seen[d] = c
    top = sorted(seen.values(), key=lambda x: x["blended_score"], reverse=True)[:top_k]

    if not top:
        return []

    # Optional BioBERT rerank (only active when USE_BIOBERT = True)
    if _biobert is not None:
        import torch
        _device = next(_biobert.parameters()).device
        q_enc   = _bio_tok(clinical_summary[:512], return_tensors='pt', max_length=512, truncation=True, padding='max_length')
        q_enc   = {k: v.to(_device) for k, v in q_enc.items()}
        with torch.no_grad():
            q_feat = _biobert(**q_enc).last_hidden_state[:, 0, :]
        for c in top:
            d_enc = _bio_tok(c["symptom_ref"], return_tensors='pt', max_length=128, truncation=True, padding='max_length')
            d_enc = {k: v.to(_device) for k, v in d_enc.items()}
            with torch.no_grad():
                d_feat = _biobert(**d_enc).last_hidden_state[:, 0, :]
            c["blended_score"] = c["blended_score"] * 0.4 + torch.nn.functional.cosine_similarity(q_feat, d_feat).item() * 0.6
        top = sorted(top, key=lambda x: x["blended_score"], reverse=True)

    max_s = top[0]["blended_score"]
    return [
        {"disease": c["disease"], "confidence": round((c["blended_score"] / max_s) * 100, 1)}
        for c in top
    ]
