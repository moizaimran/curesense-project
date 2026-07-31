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


# ── Internal helper ───────────────────────────────────────────────────────────

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
            dc = next((c for c in r.columns if 'disease' in c), r.columns[0])
            sc = next((c for c in r.columns if 'symptom' in c), r.columns[1])
            frames.append(r[[dc, sc]].rename(columns={dc: 'diseases', sc: 'symptom_text'})
                          .astype(str).apply(lambda x: x.str.strip().str.lower()))
        print("✅ DS1 loaded")
    except Exception as e:
        print(f"⬜ DS1 not available ({type(e).__name__})")

    # DS2: itachi9604/disease-symptom-description-dataset
    try:
        r2 = pd.read_csv('/kaggle/input/datasets/itachi9604/disease-symptom-description-dataset/dataset.csv')
        r2.columns = [c.strip().lower() for c in r2.columns]
        dc = next((c for c in r2.columns if 'disease' in c), r2.columns[0])
        sc = [c for c in r2.columns if 'symptom' in c]
        sym_text = r2[sc].fillna('').astype(str).apply(
            lambda col: col.str.strip().str.lower().str.replace('_', ' ')
        ).apply(lambda row: ' '.join(v for v in row if v and v != 'nan'), axis=1)
        frames.append(pd.DataFrame({'diseases': r2[dc].str.strip().str.lower(), 'symptom_text': sym_text}))
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
        dc = next((c for c in r5.columns if 'disease' in c or 'condition' in c), r5.columns[0])
        sc = next((c for c in r5.columns if any(k in c for k in ('drug', 'medicine', 'symptom', 'description', 'text'))), r5.columns[1])
        frames.append(r5[[dc, sc]].rename(columns={dc: 'diseases', sc: 'symptom_text'})
                      .astype(str).apply(lambda x: x.str.strip().str.lower()))
        print("✅ DS5 loaded")
    except Exception as e:
        print(f"⬜ DS5 not available ({type(e).__name__})")

    # DS6: uom190346a/disease-symptoms-and-patient-profile-dataset
    try:
        r6 = pd.read_csv('/kaggle/input/datasets/uom190346a/disease-symptoms-and-patient-profile-dataset/Disease_symptom_and_patient_profile_dataset.csv')
        r6.columns = [c.strip().lower() for c in r6.columns]
        dc = next((c for c in r6.columns if 'disease' in c), r6.columns[0])
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
        dc = next((c for c in r7.columns if 'disease' in c), r7.columns[0])
        sc = [c for c in r7.columns if 'symptom' in c]
        sym_text = r7[sc].fillna('').astype(str).apply(
            lambda col: col.str.strip().str.lower().str.replace('_', ' ')
        ).apply(lambda row: ' '.join(v for v in row if v and v != 'nan'), axis=1)
        frames.append(pd.DataFrame({'diseases': r7[dc].str.strip().str.lower(), 'symptom_text': sym_text}))
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
            prog_col = next((c for c in r8.columns if 'prognosis' in c or 'disease' in c), r8.columns[-1])
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
        dc = next((c for c in r9.columns if 'disease' in c or 'label' in c), r9.columns[0])
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


def rank_diseases(verified_entities: list[dict], clinical_summary: str, top_k: int = 5) -> list[dict]:
    """
    Return top-k disease candidates ranked by symptom similarity.
    Returns [] when DISEASE_RANKER_READY is False.
    """
    if not DISEASE_RANKER_READY:
        return []

    symptom_cats = {"symptom", "medical condition", "trigger", "body part"}
    symptom_kws  = [e["keyword"].lower() for e in verified_entities if e.get("category") in symptom_cats]

    med_kws = []
    for e in verified_entities:
        if e.get("category") == "medication":
            med    = e["keyword"].lower()
            mapped = next((v for k, v in MEDICINE_DISEASE_MAP.items() if k in med or med in k), None)
            if mapped:
                med_kws.append(mapped)

    all_kws = symptom_kws + med_kws
    if not all_kws:
        return []

    query     = ' '.join(all_kws) + ' ' + clinical_summary[:300]
    query_vec = _vectorizer.transform([query.lower()])
    sims      = cosine_similarity(query_vec, _tfidf_matrix)[0]
    top_idx   = sims.argsort()[-25:][::-1]

    candidates = [
        {"disease": _df.iloc[idx]["diseases"], "symptom_ref": _df.iloc[idx]["symptom_text"][:120], "tfidf_score": float(sims[idx])}
        for idx in top_idx if sims[idx] > 0
    ]

    seen = {}
    for c in candidates:
        d = c["disease"]
        if d not in seen or c["tfidf_score"] > seen[d]["tfidf_score"]:
            seen[d] = c
    top = sorted(seen.values(), key=lambda x: x["tfidf_score"], reverse=True)[:top_k]

    if not top:
        return []

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
            c["final_score"] = c["tfidf_score"] * 0.4 + torch.nn.functional.cosine_similarity(q_feat, d_feat).item() * 0.6
    else:
        for c in top:
            c["final_score"] = c["tfidf_score"]

    top   = sorted(top, key=lambda x: x["final_score"], reverse=True)
    max_s = top[0]["final_score"]
    return [{"disease": c["disease"], "confidence": round((c["final_score"] / max_s) * 100, 1)} for c in top]
