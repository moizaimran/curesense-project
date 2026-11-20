// =============================================================================
// Backend/tests/emailService.test.js
//
// Coverage: emailService — all five email-sending functions
//
// Critical behaviours under test:
//  · Each function calls transporter.sendMail with the correct to/subject.
//  · Functions silently skip sending (no throw) when SMTP_USER / SMTP_PASS unset.
//  · sendDoctorRejectionEmail: reason injected into the HTML body.
//  · sendDoctorApprovalEmail: doctor name injected into the HTML body.
//  · sendVerificationLinkEmail: link injected into the HTML body.
// =============================================================================

const mockSendMail = jest.fn().mockResolvedValue({ messageId: "test" });

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

// Set SMTP creds before requiring emailService so the module-level transporter
// is created with them in place.
process.env.SMTP_USER = "test@example.com";
process.env.SMTP_PASS = "test_pass";

const {
  sendVerificationLinkEmail,
  sendPasswordResetLinkEmail,
  sendDoctorRegistrationEmail,
  sendDoctorApprovalEmail,
  sendDoctorRejectionEmail,
} = require("../services/emailService");

beforeEach(() => {
  mockSendMail.mockClear();
});

// ── sendVerificationLinkEmail ─────────────────────────────────────────────────

describe("sendVerificationLinkEmail", () => {
  test("calls sendMail with correct to and subject", async () => {
    await sendVerificationLinkEmail("user@example.com", "http://verify.link");

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const args = mockSendMail.mock.calls[0][0];
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toMatch(/verify/i);
  });

  test("link URL is embedded in the HTML body", async () => {
    await sendVerificationLinkEmail("user@example.com", "http://verify.link/abc");

    const args = mockSendMail.mock.calls[0][0];
    expect(args.html).toContain("http://verify.link/abc");
  });

  test("skips send when SMTP_USER missing", async () => {
    const orig = process.env.SMTP_USER;
    delete process.env.SMTP_USER;

    await sendVerificationLinkEmail("user@example.com", "http://link");

    expect(mockSendMail).not.toHaveBeenCalled();
    process.env.SMTP_USER = orig;
  });
});

// ── sendPasswordResetLinkEmail ────────────────────────────────────────────────

describe("sendPasswordResetLinkEmail", () => {
  test("calls sendMail with correct to and subject", async () => {
    await sendPasswordResetLinkEmail("user@example.com", "http://reset.link");

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const args = mockSendMail.mock.calls[0][0];
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toMatch(/reset/i);
  });

  test("link URL is embedded in the HTML body", async () => {
    await sendPasswordResetLinkEmail("user@example.com", "http://reset.link/xyz");

    const args = mockSendMail.mock.calls[0][0];
    expect(args.html).toContain("http://reset.link/xyz");
  });

  test("skips send when SMTP_PASS missing", async () => {
    const orig = process.env.SMTP_PASS;
    delete process.env.SMTP_PASS;

    await sendPasswordResetLinkEmail("user@example.com", "http://link");

    expect(mockSendMail).not.toHaveBeenCalled();
    process.env.SMTP_PASS = orig;
  });
});

// ── sendDoctorRegistrationEmail ───────────────────────────────────────────────

describe("sendDoctorRegistrationEmail", () => {
  test("calls sendMail with correct to and subject containing 'review'", async () => {
    await sendDoctorRegistrationEmail("doctor@example.com", "Dr Hassan");

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const args = mockSendMail.mock.calls[0][0];
    expect(args.to).toBe("doctor@example.com");
    expect(args.subject).toMatch(/review/i);
  });

  test("doctor name is included in the HTML body", async () => {
    await sendDoctorRegistrationEmail("doctor@example.com", "Dr Hassan Raheem");

    const args = mockSendMail.mock.calls[0][0];
    expect(args.html).toContain("Dr Hassan Raheem");
  });

  test("skips send when SMTP credentials missing", async () => {
    const origUser = process.env.SMTP_USER;
    const origPass = process.env.SMTP_PASS;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    await sendDoctorRegistrationEmail("doctor@example.com", "Dr Someone");

    expect(mockSendMail).not.toHaveBeenCalled();
    process.env.SMTP_USER = origUser;
    process.env.SMTP_PASS = origPass;
  });
});

// ── sendDoctorApprovalEmail ───────────────────────────────────────────────────

describe("sendDoctorApprovalEmail", () => {
  test("calls sendMail with correct to and subject containing 'approved'", async () => {
    await sendDoctorApprovalEmail("doctor@example.com", "Dr Amina");

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const args = mockSendMail.mock.calls[0][0];
    expect(args.to).toBe("doctor@example.com");
    expect(args.subject).toMatch(/approv/i);
  });

  test("doctor name is included in the HTML body", async () => {
    await sendDoctorApprovalEmail("doctor@example.com", "Dr Amina Khan");

    const args = mockSendMail.mock.calls[0][0];
    expect(args.html).toContain("Dr Amina Khan");
  });

  test("HTML contains a login link", async () => {
    await sendDoctorApprovalEmail("doctor@example.com", "Dr Someone");

    const args = mockSendMail.mock.calls[0][0];
    expect(args.html).toMatch(/doctor\/login/i);
  });
});

// ── sendDoctorRejectionEmail ──────────────────────────────────────────────────

describe("sendDoctorRejectionEmail", () => {
  test("calls sendMail with correct to and subject", async () => {
    await sendDoctorRejectionEmail("doctor@example.com", "Dr Ali", "PMDC number not found");

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const args = mockSendMail.mock.calls[0][0];
    expect(args.to).toBe("doctor@example.com");
    expect(args.subject).toBeTruthy();
  });

  test("rejection reason is included in the HTML body", async () => {
    await sendDoctorRejectionEmail("doctor@example.com", "Dr Ali", "PMDC number does not match");

    const args = mockSendMail.mock.calls[0][0];
    expect(args.html).toContain("PMDC number does not match");
  });

  test("doctor name is included in the HTML body", async () => {
    await sendDoctorRejectionEmail("doctor@example.com", "Dr Khalid Mehmood", "reason");

    const args = mockSendMail.mock.calls[0][0];
    expect(args.html).toContain("Dr Khalid Mehmood");
  });

  test("falls back to default reason text when reason is undefined", async () => {
    await sendDoctorRejectionEmail("doctor@example.com", "Dr Someone", undefined);

    const args = mockSendMail.mock.calls[0][0];
    expect(args.html).toContain("PMDC information could not be verified");
  });

  test("skips send when SMTP credentials missing", async () => {
    const origUser = process.env.SMTP_USER;
    const origPass = process.env.SMTP_PASS;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    await sendDoctorRejectionEmail("doctor@example.com", "Dr Someone", "reason");

    expect(mockSendMail).not.toHaveBeenCalled();
    process.env.SMTP_USER = origUser;
    process.env.SMTP_PASS = origPass;
  });
});
