# ==============================================================================
# glinker/diagnosis/emergency_flags.py
#
# Static red-flag lookup — no LLM, no FAISS, no database.
# Used by the Diagnosis Assessment step to detect life-threatening conditions
# in the interpretedDiagnoses list before the report reaches the frontend.
#
# Matching is bidirectional and prefix-based:
#   code.startswith(prefix) handles the normal case (leaf code returned).
#   prefix.startswith(code) handles the case where Disease RAG returns a shorter
#   parent code (e.g. "I71") than the red-flag entry ("I71.0") — which happens
#   when a condition entered the index via the ICD-only 3-char path in
#   build_disease_index.py. For a safety check, erring toward "warn when
#   ambiguous" is the correct failure mode.
#
# Longer prefixes are checked first (sorted by descending length) so more
# specific entries win when multiple prefixes could match the same code.
# ==============================================================================

EMERGENCY_RED_FLAGS: dict[str, str] = {

    # ── Stroke ────────────────────────────────────────────────────────────────
    "I63"  : "Ischemic stroke — call emergency services immediately (thrombolysis is time-critical)",
    "I61"  : "Intracerebral haemorrhage — life-threatening stroke, call emergency services immediately",
    "I62"  : "Nontraumatic intracranial haemorrhage — call emergency services immediately",
    "I60"  : "Subarachnoid haemorrhage — sudden severe ('thunderclap') headache, call emergency services immediately",

    # ── Myocardial infarction ─────────────────────────────────────────────────
    "I21"  : "Acute myocardial infarction (heart attack) — time-critical, call emergency services immediately",
    "I22"  : "Subsequent myocardial infarction — ongoing cardiac event, call emergency services immediately",

    # ── Sepsis ────────────────────────────────────────────────────────────────
    "A41"  : "Sepsis — life-threatening systemic infection, requires emergency IV antibiotics",
    "A40"  : "Streptococcal sepsis — life-threatening, call emergency services immediately",

    # ── Appendicitis ──────────────────────────────────────────────────────────
    "K35"  : "Acute appendicitis — risk of rupture, urgent surgical evaluation required",

    # ── Pulmonary embolism ────────────────────────────────────────────────────
    "I26"  : "Pulmonary embolism — life-threatening clot in the lungs, call emergency services immediately",

    # ── Aortic dissection ─────────────────────────────────────────────────────
    # I71.0 is the leaf-code prefix for dissection specifically; I71 (parent) is
    # aortic aneurysm/dissection undifferentiated — bidirectional matching means
    # I71 returned by Disease RAG will still trigger this warning, which is the
    # correct behaviour for a safety check.
    "I71.0": "Aortic dissection — surgical emergency, call emergency services immediately",

    # ── Meningitis ────────────────────────────────────────────────────────────
    "G00"  : "Bacterial meningitis — life-threatening, call emergency services immediately",
    "G01"  : "Meningitis in bacterial disease — life-threatening, call emergency services immediately",
    "G03"  : "Meningitis — possible life-threatening infection, seek emergency care",

    # ── Anaphylaxis ───────────────────────────────────────────────────────────
    # T78.2 is the broad catch-all (anaphylactic shock, unspecified cause) and
    # covers most presentations regardless of trigger.
    # T78.0 is specifically food-triggered anaphylaxis; drug-triggered (T88.6x)
    # and insect-sting (T63.x) are separate codes not listed here — T78.2 remains
    # the primary safety net.
    "T78.2": "Anaphylactic shock — administer epinephrine immediately, call emergency services",
    "T78.0": "Anaphylactic reaction to food — risk of progression to anaphylactic shock",

    # ── Thunderclap headache ──────────────────────────────────────────────────
    # G44.53 is the leaf code for Primary thunderclap headache. Bidirectional
    # matching means the parent G44 returned by Disease RAG will also trigger
    # this warning — acceptable false-alarm cost given the severity of a missed SAH.
    "G44.53": "Primary thunderclap headache — requires urgent neuroimaging to exclude subarachnoid haemorrhage",

    # ── Acute pulmonary oedema ────────────────────────────────────────────────
    "J81.0": "Acute pulmonary oedema — respiratory emergency, call emergency services immediately",

    # ── Status epilepticus ────────────────────────────────────────────────────
    "G41"  : "Status epilepticus — prolonged seizure, call emergency services immediately",

    # ── Acute liver failure ───────────────────────────────────────────────────
    "K72.0": "Acute liver failure — life-threatening, requires emergency hospital admission",

    # ── Tension pneumothorax ──────────────────────────────────────────────────
    "J93.0": "Spontaneous tension pneumothorax — respiratory emergency, call emergency services immediately",

    # ── Ectopic pregnancy ─────────────────────────────────────────────────────
    "O00"  : "Ectopic pregnancy — risk of rupture and haemorrhage, call emergency services immediately",
}


def check_emergency(icd_code: str) -> str | None:
    """
    Check a single ICD-10 code against EMERGENCY_RED_FLAGS.

    Matching is bidirectional:
      - code.startswith(prefix): normal case — Disease RAG returns a leaf code,
        prefix is the red-flag entry (e.g. "I63.9" matches prefix "I63").
      - prefix.startswith(code): fallback — Disease RAG returns a shorter parent
        code (e.g. "I71") that the build script stored at 3-char granularity,
        and the red-flag entry is more specific (e.g. "I71.0").

    Longer prefixes are checked first so more specific entries win.
    Returns the reason string if matched, None otherwise.
    """
    if not icd_code:
        return None
    code = icd_code.strip().upper()
    for prefix in sorted(EMERGENCY_RED_FLAGS, key=len, reverse=True):
        p = prefix.upper()
        if code.startswith(p) or p.startswith(code):
            return EMERGENCY_RED_FLAGS[prefix]
    return None


def check_emergency_list(diagnoses: list[dict]) -> dict | None:
    """
    Scan a list of interpretedDiagnoses dicts (each with 'icdCode' and
    'plausibility' keys) and return the first red-flag match found among
    entries where plausibility == 'likely'.

    Only 'likely' entries are checked — a 'possible' aortic dissection does
    not trigger an emergency alert, which prevents near-every chest-pain
    session from firing.

    Returns:
        {"triggered": True, "reason": <str>, "icdCode": <code>}
        or None if nothing matches.
    """
    for d in diagnoses:
        if d.get("plausibility") != "likely":
            continue
        code = d.get("icdCode", "").strip()
        reason = check_emergency(code)
        if reason:
            return {"triggered": True, "reason": reason, "icdCode": code}
    return None
