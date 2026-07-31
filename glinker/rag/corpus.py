# ==============================================================================
# glinker/rag/corpus.py
#
# openFDA direct API caller.
#
# Medications are NOT stored in the vector database. Each time a patient
# reports a drug, this module queries openFDA directly for that drug's label
# and returns the structured data. No downloading, no chunking, no embedding.
#
# The static knowledge base (textbooks + guidelines) is handled separately
# in ingestion.py and retrieval.py.
# ==============================================================================
import requests

OPENFDA_ENDPOINT = "https://api.fda.gov/drug/label.json"

DRUG_SECTIONS = [
    "indications_and_usage",
    "dosage_and_administration",
    "contraindications",
    "warnings_and_precautions",
    "drug_interactions",
    "adverse_reactions",
    "clinical_pharmacology",
]


def fetch_openfda(generic_name: str) -> dict | None:
    """
    Query openFDA for a drug label by generic name.
    Returns a dict with the drug name and a {section: text} mapping,
    or None if nothing found.

    Called at report-generation time — not during the interview.
    """
    def _query(params):
        r = requests.get(OPENFDA_ENDPOINT, params=params, timeout=15)
        r.raise_for_status()
        return r.json().get("results", [])

    try:
        results = _query({"search": f'openfda.generic_name:"{generic_name}"', "limit": 5})
        if not results:
            results = _query({"search": f'openfda.substance_name:"{generic_name.upper()}"', "limit": 5})
        if not results:
            print(f"[openFDA] No label found for '{generic_name}'")
            return None

        best = max(results, key=lambda x: sum(1 for s in DRUG_SECTIONS if x.get(s)))
        sections = {
            s: (" ".join(best[s]) if isinstance(best.get(s), list) else str(best[s]))
            for s in DRUG_SECTIONS
            if best.get(s)
        }
        print(f"[openFDA] '{generic_name}': {len(sections)} section(s) retrieved")
        return {"drug": generic_name, "source": f"openFDA:{generic_name}", "sections": sections}

    except Exception as e:
        print(f"[openFDA] Error fetching '{generic_name}': {e}")
        return None
