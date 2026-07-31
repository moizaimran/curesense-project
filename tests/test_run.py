# ==============================================================================
# tests/test_run.py — end-to-end test harness
# ==============================================================================
from glinker.interview.session import PatientInterview
from pipeline import run_clinical_pipeline, print_clinical_report
from tests.simulated_patient import SimulatedPatient


def run_dynamic_interview(
    case_facts: str,
    persona: str = "confused_village",
    opening_line: str | None = None,
    max_rounds: int = 8,
):
    """
    Runs the intake assistant and a simulated patient against each other for up
    to max_rounds turns, then runs the full clinical pipeline once at the end
    (GLiNER → finalize → retrieve → openFDA → doctor report + patient summary).
    """
    doctor  = PatientInterview()
    patient = SimulatedPatient(case_facts, persona=persona)

    patient_message = opening_line or "Doctor, I'm not feeling well."
    for round_num in range(1, max_rounds + 1):
        turn = doctor.send(patient_message)
        print(f"Patient (raw):       {patient_message}")
        print(f"Patient (corrected): {turn['correctedPatientText']}")
        print(f"Assistant [{turn['status']}]: {turn['message']}\n")
        if turn["status"] == "complete":
            break
        patient_message = patient.reply_to(turn["message"])

    if doctor.done:
        print("--- Interview ended — running clinical pipeline ---")
        report = run_clinical_pipeline(doctor)
        print_clinical_report(report)
        return doctor, report

    print("Interview hit max_rounds without completing — no report run.")
    return doctor, None


# ── Example test cases ────────────────────────────────────────────────────────

HEADACHE_CASE = (
    "Chief complaint: throbbing headache, right side, started 2 days ago, 6/10, worse "
    "with bright light, mild nausea, no vomiting. Takes Losartan 50mg once daily for BP. "
    "No known drug allergies."
)

KNEE_CASE = (
    "Chief complaint: left knee pain for 3 weeks, aching and stiff especially in the morning, "
    "worse going up stairs. No injury. Takes ibuprofen occasionally for pain. No allergies."
)


if __name__ == "__main__":
    run_dynamic_interview(HEADACHE_CASE, persona="confused_village")
