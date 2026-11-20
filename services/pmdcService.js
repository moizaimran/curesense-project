const axios      = require("axios");
const similarity = require("string-similarity");
const qs         = require("querystring");

const SEARCH_URL       = "https://hospitals-inspections.pmdc.pk/api/DRC/GetData";
const DETAIL_URL       = "https://hospitals-inspections.pmdc.pk/api/DRC/GetQualifications";
const HEADERS          = {
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  "Referer":      "https://pmdc.pk/",
  "User-Agent":   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
};

// ── PMDC API Calls ────────────────────────────────────────────────────────────

async function searchByRegNo(registrationNo) {
  const res = await axios.post(SEARCH_URL, qs.stringify({ RegistrationNo: registrationNo }), {
    headers: HEADERS,
    timeout: 15000,
  });
  if (res.data?.status && res.data.data?.length > 0) {
    return res.data.data[0]; // { RegistrationNo, Name, FatherName, Status }
  }
  return null;
}

async function getDetailByRegNo(registrationNo) {
  const res = await axios.post(DETAIL_URL, qs.stringify({ RegistrationNo: registrationNo }), {
    headers: HEADERS,
    timeout: 15000,
  });
  if (res.data?.status && res.data.data) {
    return res.data.data;
    // { RegistrationNo, Name, FatherName, RegistrationType, Status,
    //   RegistrationDate, ValidUpto, Qualifications: [{ Degree, Speciality, University, PassingYear }] }
  }
  return null;
}

// ── Fuzzy Matching ────────────────────────────────────────────────────────────

function normalise(str) {
  return (str || "")
    .toLowerCase()
    .replace(/^dr\.?\s+/i, "")   // strip "Dr." prefix PMDC adds
    .replace(/\s+/g, " ")
    .trim();
}

function computeVerificationScore({ pmdcDetail, nameFromCnic, fatherNameFromCnic, typedName, specialty }) {
  const breakdown = {};
  let score = 0;

  // ── 1. PMDC name vs CNIC name (50 %) ──────────────────────────────────────
  if (pmdcDetail?.Name && nameFromCnic) {
    breakdown.name_vs_cnic = similarity.compareTwoStrings(
      normalise(pmdcDetail.Name),
      normalise(nameFromCnic)
    );
    score += breakdown.name_vs_cnic * 0.50;
  }

  // ── 2. PMDC father name vs CNIC father name (25 %) ────────────────────────
  if (pmdcDetail?.FatherName && fatherNameFromCnic) {
    breakdown.father_name_vs_cnic = similarity.compareTwoStrings(
      normalise(pmdcDetail.FatherName),
      normalise(fatherNameFromCnic)
    );
    score += breakdown.father_name_vs_cnic * 0.25;
  }

  // ── 3. License is active (15 %) ───────────────────────────────────────────
  // "In Active" means inactive — only match standalone "Active"
  const licenseActive = /^active$/i.test((pmdcDetail?.Status || "").trim());
  breakdown.license_active = licenseActive;
  if (licenseActive) score += 0.15;

  // ── 4. Specialty vs PMDC qualifications (10 %) ────────────────────────────
  if (specialty && pmdcDetail?.Qualifications?.length > 0) {
    const qualText = pmdcDetail.Qualifications
      .map((q) => `${q.Degree} ${q.Speciality}`)
      .join(" ");
    breakdown.specialty_match = similarity.compareTwoStrings(
      normalise(specialty),
      normalise(qualText)
    );
    score += breakdown.specialty_match * 0.10;
  }

  // ── Bonus: typed name vs CNIC name (consistency check, no weight) ─────────
  if (typedName && nameFromCnic) {
    breakdown.typed_vs_cnic = similarity.compareTwoStrings(
      normalise(typedName),
      normalise(nameFromCnic)
    );
  }

  const confidence = Number(Math.min(score, 1.0).toFixed(3));
  const decision   =
    confidence >= 0.85 ? "auto_approved" :
    confidence >= 0.60 ? "flagged"       :
                         "rejected";

  return { confidence, breakdown, decision };
}

// ── Main exported function ────────────────────────────────────────────────────

async function verifyDoctor({ pmdcNumber, nameFromCnic, fatherNameFromCnic, typedName, specialty }) {
  let pmdcDetail = null;

  try {
    pmdcDetail = await getDetailByRegNo(pmdcNumber);

    // Fall back to search if detail endpoint returns nothing
    if (!pmdcDetail) {
      const searchRow = await searchByRegNo(pmdcNumber);
      if (searchRow) {
        pmdcDetail = {
          Name:        searchRow.Name,
          FatherName:  searchRow.FatherName,
          Status:      searchRow.Status,
          Qualifications: [],
        };
      }
    }
  } catch (err) {
    console.error("[pmdcService] API error:", err.message);
  }

  if (!pmdcDetail) {
    return {
      pmdc_found: false,
      confidence: 0,
      decision:   "flagged",
      breakdown:  {},
      message:    "PMDC lookup failed or registration number not found — flagged for admin review",
    };
  }

  const { confidence, breakdown, decision } = computeVerificationScore({
    pmdcDetail,
    nameFromCnic,
    fatherNameFromCnic,
    typedName,
    specialty,
  });

  return {
    pmdc_found:         true,
    pmdc_name:          pmdcDetail.Name,
    pmdc_father_name:   pmdcDetail.FatherName,
    pmdc_status:        pmdcDetail.Status,
    pmdc_valid_upto:    pmdcDetail.ValidUpto    || null,
    pmdc_reg_type:      pmdcDetail.RegistrationType || null,
    pmdc_qualifications: (pmdcDetail.Qualifications || []).map((q) => ({
      degree:       q.Degree,
      speciality:   q.Speciality,
      university:   q.University,
      passing_year: q.PassingYear,
    })),
    confidence,
    breakdown,
    decision,
  };
}

module.exports = { verifyDoctor };
