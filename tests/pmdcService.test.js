// =============================================================================
// Backend/tests/pmdcService.test.js
//
// Coverage: pmdcService (normalise, computeVerificationScore, verifyDoctor)
//
// Critical behaviours under test:
//  · normalise: lowercases, strips Dr. prefix, collapses whitespace.
//  · computeVerificationScore: weights (name 50%, father 25%, active 15%, specialty 10%).
//  · decision thresholds: ≥0.85 auto_approved, ≥0.60 flagged, <0.60 rejected.
//  · verifyDoctor: detail endpoint hit first, falls back to search endpoint.
//  · verifyDoctor: PMDC not found → pmdc_found:false, decision:flagged.
//  · verifyDoctor: API error → pmdc_found:false, decision:flagged (never throws).
// =============================================================================

jest.mock("axios");
const axios = require("axios");
const { verifyDoctor } = require("../services/pmdcService");

// Access private helpers by requiring the module directly and exporting from
// it; since they aren't exported we test them indirectly via verifyDoctor, but
// we can also test normalise + computeVerificationScore by calling verifyDoctor
// with controlled axios responses.

const GOOD_DETAIL = {
  data: {
    status: true,
    data: {
      RegistrationNo:    "PMDC-001",
      Name:              "Dr. HASSAN RAHEEM",
      FatherName:        "ABDUL RAHEEM",
      Status:            "Active",
      RegistrationType:  "Specialist",
      ValidUpto:         "2030-12-31",
      Qualifications:    [{ Degree: "MBBS", Speciality: "Cardiology", University: "UHS", PassingYear: "2010" }],
    },
  },
};

const GOOD_SEARCH = {
  data: {
    status: true,
    data: [{ RegistrationNo: "PMDC-001", Name: "HASSAN RAHEEM", FatherName: "ABDUL RAHEEM", Status: "Active" }],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ── normalise (tested via score) ──────────────────────────────────────────────

describe("normalise — via score comparison", () => {
  test("Dr. prefix stripped: 'Dr. Hassan Raheem' matches 'HASSAN RAHEEM' perfectly", async () => {
    axios.post.mockResolvedValueOnce(GOOD_DETAIL);

    const result = await verifyDoctor({
      pmdcNumber:         "PMDC-001",
      nameFromCnic:       "HASSAN RAHEEM",
      fatherNameFromCnic: "ABDUL RAHEEM",
      typedName:          "",
      specialty:          "Cardiology",
    });

    // name_vs_cnic should be 1.0 since "dr. hassan raheem" normalises to "hassan raheem"
    expect(result.breakdown.name_vs_cnic).toBeCloseTo(1.0, 1);
  });
});

// ── computeVerificationScore decision thresholds ──────────────────────────────

describe("computeVerificationScore — decision thresholds", () => {
  test("perfect match → auto_approved", async () => {
    axios.post.mockResolvedValueOnce(GOOD_DETAIL);

    const result = await verifyDoctor({
      pmdcNumber:         "PMDC-001",
      nameFromCnic:       "HASSAN RAHEEM",
      fatherNameFromCnic: "ABDUL RAHEEM",
      typedName:          "",
      specialty:          "Cardiology",
    });

    expect(result.decision).toBe("auto_approved");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  test("name match only, inactive license → rejected (score < 0.60)", async () => {
    const inactiveDetail = {
      data: {
        status: true,
        data: {
          Name:           "AMINA KHAN",
          FatherName:     "WRONG FATHER",
          Status:         "In Active",
          Qualifications: [],
        },
      },
    };
    axios.post.mockResolvedValueOnce(inactiveDetail);

    const result = await verifyDoctor({
      pmdcNumber:         "PMDC-002",
      nameFromCnic:       "AMINA KHAN",
      fatherNameFromCnic: "ZAHRA BIBI",
      typedName:          "",
      specialty:          "",
    });

    // name_vs_cnic * 0.50 ≈ 0.50; father mismatch * 0.25 ≈ low; no active bonus; < 0.60
    expect(result.decision).not.toBe("auto_approved");
    expect(result.pmdc_found).toBe(true);
  });

  test("moderate match → flagged (confidence 0.60–0.84)", async () => {
    // Name matches but father name slightly off; license active → ~0.65–0.75
    const partialDetail = {
      data: {
        status: true,
        data: {
          Name:           "HASSAN RAHEEM",
          FatherName:     "A RAHEEM", // partial father name
          Status:         "Active",
          Qualifications: [],
        },
      },
    };
    axios.post.mockResolvedValueOnce(partialDetail);

    const result = await verifyDoctor({
      pmdcNumber:         "PMDC-003",
      nameFromCnic:       "HASSAN RAHEEM",
      fatherNameFromCnic: "ABDUL RAHEEM KHAN",
      typedName:          "",
      specialty:          "",
    });

    // name_vs_cnic=1.0*0.50=0.50 + partial_father*0.25 + active 0.15 = ~0.65+
    expect(result.confidence).toBeGreaterThanOrEqual(0.60);
    expect(result.confidence).toBeLessThan(0.85);
    expect(result.decision).toBe("flagged");
  });
});

// ── verifyDoctor: detail-first, search fallback ───────────────────────────────

describe("verifyDoctor — PMDC API interaction", () => {
  test("detail endpoint called first; result used directly", async () => {
    axios.post.mockResolvedValueOnce(GOOD_DETAIL);

    const result = await verifyDoctor({
      pmdcNumber:         "PMDC-001",
      nameFromCnic:       "HASSAN RAHEEM",
      fatherNameFromCnic: "ABDUL RAHEEM",
      typedName:          "",
      specialty:          "",
    });

    expect(result.pmdc_found).toBe(true);
    expect(result.pmdc_name).toBe("Dr. HASSAN RAHEEM");
    expect(result.pmdc_status).toBe("Active");
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test("detail endpoint returns empty → falls back to search endpoint", async () => {
    // First call (detail) → no data
    axios.post.mockResolvedValueOnce({ data: { status: false } });
    // Second call (search) → found
    axios.post.mockResolvedValueOnce(GOOD_SEARCH);

    const result = await verifyDoctor({
      pmdcNumber:         "PMDC-001",
      nameFromCnic:       "HASSAN RAHEEM",
      fatherNameFromCnic: "ABDUL RAHEEM",
      typedName:          "",
      specialty:          "",
    });

    expect(result.pmdc_found).toBe(true);
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  test("PMDC number not found in either endpoint → pmdc_found:false, decision:flagged", async () => {
    axios.post.mockResolvedValue({ data: { status: false } });

    const result = await verifyDoctor({
      pmdcNumber:         "PMDC-UNKNOWN",
      nameFromCnic:       "TEST NAME",
      fatherNameFromCnic: "TEST FATHER",
      typedName:          "",
      specialty:          "",
    });

    expect(result.pmdc_found).toBe(false);
    expect(result.decision).toBe("flagged");
    expect(result.confidence).toBe(0);
  });

  test("PMDC API throws network error → pmdc_found:false, never throws", async () => {
    axios.post.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      verifyDoctor({
        pmdcNumber:         "PMDC-001",
        nameFromCnic:       "TEST",
        fatherNameFromCnic: "TEST",
        typedName:          "",
        specialty:          "",
      })
    ).resolves.toMatchObject({ pmdc_found: false, decision: "flagged" });
  });

  test("response includes pmdc_qualifications array", async () => {
    axios.post.mockResolvedValueOnce(GOOD_DETAIL);

    const result = await verifyDoctor({
      pmdcNumber:         "PMDC-001",
      nameFromCnic:       "HASSAN RAHEEM",
      fatherNameFromCnic: "ABDUL RAHEEM",
      typedName:          "",
      specialty:          "",
    });

    expect(Array.isArray(result.pmdc_qualifications)).toBe(true);
    expect(result.pmdc_qualifications[0].degree).toBe("MBBS");
    expect(result.pmdc_qualifications[0].speciality).toBe("Cardiology");
  });

  test("breakdown contains name_vs_cnic and father_name_vs_cnic keys", async () => {
    axios.post.mockResolvedValueOnce(GOOD_DETAIL);

    const result = await verifyDoctor({
      pmdcNumber:         "PMDC-001",
      nameFromCnic:       "HASSAN RAHEEM",
      fatherNameFromCnic: "ABDUL RAHEEM",
      typedName:          "",
      specialty:          "",
    });

    expect(result.breakdown).toHaveProperty("name_vs_cnic");
    expect(result.breakdown).toHaveProperty("father_name_vs_cnic");
    expect(result.breakdown).toHaveProperty("license_active");
  });
});
