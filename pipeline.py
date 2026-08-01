# ==============================================================================
# pipeline.py — top-level orchestration
#
# run_clinical_pipeline(interview)
#   Runs everything ONCE, after interview.done is True:
#     1. GLiNER  — extract candidate entities from the full transcript
#     2. Finalize — LLM verifies entities, writes summary, picks specialty,
#                   builds a dense ragQuery
#     3. Retrieve — embed ragQuery, search textbook+guideline FAISS index
#     4. Medication — call openFDA directly for each drug the patient mentioned
#     5. Doctor report  — grounded, cited, clinician-facing
#     6. Patient summary — plain-language, empathetic, patient-facing
#
# No retrieval happens turn-by-turn during the interview — single pass at end.
# ==============================================================================
from glinker.diagnosis.finalize      import run_gliner, finalize_report
from glinker.diagnosis.doctor_report import diagnose_for_doctor
from glinker.diagnosis.patient_summary import summarize_for_patient
from glinker.rag.retrieval           import retrieve_context, get_medication_info


def run_clinical_pipeline(interview) -> dict:
    """
    Full post-interview pipeline. Raises RuntimeError if called before the
    interview is marked done, so it can never run mid-conversation.
    """
    if not interview.done:
        raise RuntimeError("Interview isn't complete yet — cannot run the clinical pipeline.")

    transcript_text = interview.full_transcript()

    # ── 1. GLiNER ────────────────────────────────────────────────────────────
    gliner_entities = run_gliner(transcript_text)

    # ── 2. Finalize (entity verification + summary + specialty + ragQuery) ───
    report = finalize_report(transcript_text, gliner_entities)
    rag_query = report.get("ragQuery", "")

    # ── 3. Retrieve from textbooks + guidelines vector index ─────────────────
    retrieved_chunks = []
    if rag_query:
        try:
            retrieved_chunks = retrieve_context(rag_query)
            n = len(retrieved_chunks)
            print(f"[RAG] {n} chunk(s) retrieved." if n else "[RAG] No chunks above threshold — using LLM-only routing.")
        except Exception as e:
            print(f"[RAG] retrieve_context failed: {e} — continuing without retrieval.")

    # ── 4. Medication info direct from openFDA (not from vector DB) ──────────
    med_names = [e["keyword"] for e in report["entities"] if e.get("category") == "medication"]
    medication_info = {}
    if med_names:
        try:
            medication_info = get_medication_info(med_names)
        except Exception as e:
            print(f"[openFDA] get_medication_info failed: {e} — continuing without drug data.")

    # ── 5. Doctor-facing grounded report ─────────────────────────────────────
    doctor_report = diagnose_for_doctor(
        transcript_text, report["entities"], retrieved_chunks, medication_info
    )

    # ── 6. Patient-facing plain-language summary ──────────────────────────────
    patient_summary = summarize_for_patient(
        transcript_text, report["entities"], retrieved_chunks, medication_info
    )

    return {
        "transcript"      : transcript_text,
        "rawEntities"     : gliner_entities,
        "verifiedEntities": report["entities"],
        "ragQuery"        : rag_query,
        "rankedDiseases"  : report["rankedDiseases"],
        "retrievedSources": retrieved_chunks,
        "medicationInfo"  : medication_info,
        "doctorReport"    : doctor_report,
        "patientSummary"  : patient_summary,
    }


def print_clinical_report(report: dict) -> None:
    """Pretty-print a run_clinical_pipeline() result to stdout."""
    print("\nTranscript:", report["transcript"])

    print("\nVerified entities:")
    if not report["verifiedEntities"]:
        print("  (none)")
    for e in report["verifiedEntities"]:
        relates = f" (-> {e['relates_to']})" if e.get("relates_to") else ""
        print(f"  {e['keyword']!r:25} -> {e['category']}{relates}")

    if report.get("ragQuery"):
        print(f"\nRAG Query: {report['ragQuery']}")

    if report.get("rankedDiseases"):
        print("\nRanked disease candidates:")
        for d in report["rankedDiseases"]:
            bar = "█" * int(d["confidence"] / 10)
            print(f"  {d['disease']:35} {bar} {d['confidence']}%")

    if report.get("retrievedSources"):
        print("\nRetrieved reference chunks:")
        for i, c in enumerate(report["retrievedSources"], 1):
            lbl = c["source"]
            if c.get("title"): lbl += f" | {c['title']}"
            print(f"  [{i}] {lbl} (score={c['score']})")
            print(f"       {c['text'][:120].replace(chr(10), ' ')}...")

    if report.get("medicationInfo"):
        print("\nMedication data (openFDA):")
        for drug in report["medicationInfo"]:
            print(f"  {drug}: {list(report['medicationInfo'][drug].get('sections', {}).keys())}")

    # ── Doctor report ─────────────────────────────────────────────────────────
    dr = report.get("doctorReport", {})
    if dr:
        print("\n" + "=" * 60)
        print("DOCTOR-FACING REPORT")
        print("=" * 60)
        print(f"Specialty : {dr['specialtyRecommendation']}")
        print(f"Reasoning : {dr['specialtyReasoning']}")
        if dr.get("clinicalConsiderations"):
            print("\nClinical Considerations (from retrieved guidelines):")
            for con in dr["clinicalConsiderations"]:
                print(f"  • {con['point']}")
                if con.get("citation"): print(f"    ↳ {con['citation']}")
        if dr.get("medicationFlags"):
            print("\nMedication Flags (from openFDA labels):")
            for m in dr["medicationFlags"]:
                print(f"  {m['drug']}: {m['flag']}")
                if m.get("citation"): print(f"    ↳ {m['citation']}")
        print(f"\nRetrieval status: {dr['retrievalStatus']}")
        if dr.get("confidenceNote"): print(f"Note: {dr['confidenceNote']}")

    # ── Patient summary ───────────────────────────────────────────────────────
    ps = report.get("patientSummary", {})
    if ps:
        print("\n" + "=" * 60)
        print("PATIENT-FACING SUMMARY")
        print("=" * 60)
        if ps.get("specialty"):
            print(f"Suggested specialty: {ps['specialty']}")
        print(ps.get("whatWeHeard", ""))
        if ps.get("whatToExpect"):
            print("\nWhat to expect:")
            for pt in ps["whatToExpect"]:
                src = f" ({pt['source']})" if pt.get("source") else ""
                print(f"  • {pt['point']}{src}")
        if ps.get("yourMedications"):
            print("\nAbout your medications:")
            for m in ps["yourMedications"]:
                print(f"  {m['drug']}: {m['note']}")
