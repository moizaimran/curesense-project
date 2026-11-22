const nodemailer = require("nodemailer");
const logger     = require("../utils/logger");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function _linkEmailHtml(link, type) {
  const isVerify = type === "email_verification";
  const heading  = isVerify ? "Verify your email address" : "Reset your password";
  const bodyLine = isVerify
    ? "Click the button below to verify your CureSense account. This link expires in <strong>24 hours</strong>."
    : "Click the button below to reset your CureSense password. This link expires in <strong>1 hour</strong>.";
  const warning  = isVerify
    ? "If you did not create a CureSense account, you can safely ignore this email."
    : "If you did not request a password reset, you can safely ignore this email.";
  const btnLabel = isVerify ? "Verify Email" : "Reset Password";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#050816;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050816;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#0A1433;border-radius:20px;border:1px solid rgba(255,255,255,0.10);overflow:hidden;max-width:520px;width:100%;">
          <tr>
            <td style="background:linear-gradient(135deg,#1D4ED8,#7C3AED);padding:32px 40px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="background:rgba(255,255,255,0.15);border-radius:14px;padding:10px 14px;">
                    <span style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:-0.5px;">&#9889; CureSense</span>
                  </td>
                </tr>
              </table>
              <p style="color:rgba(255,255,255,0.75);font-size:13px;margin:14px 0 0;">AI-Powered Healthcare</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 32px;">
              <h1 style="color:#EAF1FF;font-size:22px;font-weight:800;margin:0 0 12px;">${heading}</h1>
              <p style="color:rgba(234,241,255,0.62);font-size:14px;line-height:22px;margin:0 0 28px;">${bodyLine}</p>
              <div style="text-align:center;margin-bottom:28px;">
                <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#1D4ED8,#7C3AED);color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;padding:16px 36px;border-radius:12px;letter-spacing:0.2px;">${btnLabel}</a>
              </div>
              <p style="color:rgba(234,241,255,0.38);font-size:12px;line-height:20px;margin:0;">${warning}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 32px;border-top:1px solid rgba(255,255,255,0.07);">
              <p style="color:rgba(234,241,255,0.25);font-size:11px;text-align:center;margin:0;">
                &copy; 2026 CureSense &nbsp;&bull;&nbsp; This is an automated message, please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendVerificationLinkEmail(toEmail, link) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn("SMTP_USER or SMTP_PASS not set — skipping email send");
    // Dev fallback: print the link so it can be opened manually (never in production).
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n[DEV] Email verification link for ${toEmail}:\n${link}\n`);
    }
    return;
  }
  await transporter.sendMail({
    from:    `"CureSense" <${process.env.SMTP_USER}>`,
    to:      toEmail,
    subject: "Verify your CureSense email address",
    html:    _linkEmailHtml(link, "email_verification"),
  });
  logger.info({ to: toEmail }, "Verification link email sent");
}

async function sendPasswordResetLinkEmail(toEmail, link) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn("SMTP_USER or SMTP_PASS not set — skipping email send");
    return;
  }
  await transporter.sendMail({
    from:    `"CureSense" <${process.env.SMTP_USER}>`,
    to:      toEmail,
    subject: "Reset your CureSense password",
    html:    _linkEmailHtml(link, "password_reset"),
  });
  logger.info({ to: toEmail }, "Password reset link email sent");
}

async function sendDoctorRegistrationEmail(toEmail, doctorName) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn("SMTP_USER or SMTP_PASS not set — skipping email send");
    return;
  }
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#050816;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050816;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#0A1433;border-radius:20px;border:1px solid rgba(255,255,255,0.10);overflow:hidden;max-width:520px;width:100%;">
          <tr>
            <td style="background:linear-gradient(135deg,#1D4ED8,#7C3AED);padding:32px 40px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="background:rgba(255,255,255,0.15);border-radius:14px;padding:10px 14px;">
                    <span style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:-0.5px;">&#9889; CureSense</span>
                  </td>
                </tr>
              </table>
              <p style="color:rgba(255,255,255,0.75);font-size:13px;margin:14px 0 0;">AI-Powered Healthcare</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 32px;">
              <h1 style="color:#EAF1FF;font-size:22px;font-weight:800;margin:0 0 12px;">Account Under Review</h1>
              <p style="color:rgba(234,241,255,0.75);font-size:15px;line-height:24px;margin:0 0 16px;">Hi <strong>${doctorName}</strong>,</p>
              <p style="color:rgba(234,241,255,0.62);font-size:14px;line-height:22px;margin:0 0 20px;">
                Thank you for registering as a doctor on CureSense. Your account has been created and is currently
                <strong style="color:#93C5FD;">pending admin verification</strong>.
              </p>
              <p style="color:rgba(234,241,255,0.62);font-size:14px;line-height:22px;margin:0 0 20px;">
                Our team will review your PMDC registration details. Once approved, you'll receive another email
                and you'll be able to log in to your CureSense dashboard.
              </p>
              <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:16px 20px;margin-bottom:24px;">
                <p style="color:rgba(234,241,255,0.45);font-size:12px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;">What happens next?</p>
                <ul style="color:rgba(234,241,255,0.62);font-size:13px;line-height:22px;margin:0;padding-left:18px;">
                  <li>Admin verifies your PMDC registration number</li>
                  <li>You receive an approval email within 1–2 business days</li>
                  <li>You can then log in and start using CureSense</li>
                </ul>
              </div>
              <p style="color:rgba(234,241,255,0.38);font-size:12px;line-height:20px;margin:0;">
                If you did not create this account, please contact our support team immediately.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 32px;border-top:1px solid rgba(255,255,255,0.07);">
              <p style="color:rgba(234,241,255,0.25);font-size:11px;text-align:center;margin:0;">
                &copy; 2026 CureSense &nbsp;&bull;&nbsp; This is an automated message, please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  await transporter.sendMail({
    from:    `"CureSense" <${process.env.SMTP_USER}>`,
    to:      toEmail,
    subject: "Your CureSense doctor account is under review",
    html,
  });
  logger.info({ to: toEmail }, "Doctor registration email sent");
}

async function sendDoctorApprovalEmail(toEmail, doctorName) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn("SMTP_USER or SMTP_PASS not set — skipping email send");
    return;
  }
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#050816;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050816;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#0A1433;border-radius:20px;border:1px solid rgba(255,255,255,0.10);overflow:hidden;max-width:520px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#1D4ED8,#7C3AED);padding:32px 40px;text-align:center;">
            <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
              <td style="background:rgba(255,255,255,0.15);border-radius:14px;padding:10px 14px;">
                <span style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:-0.5px;">&#9889; CureSense</span>
              </td>
            </tr></table>
            <p style="color:rgba(255,255,255,0.75);font-size:13px;margin:14px 0 0;">AI-Powered Healthcare</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <h1 style="color:#EAF1FF;font-size:22px;font-weight:800;margin:0 0 12px;">Your Account is Approved! &#127881;</h1>
            <p style="color:rgba(234,241,255,0.75);font-size:15px;line-height:24px;margin:0 0 16px;">Hi <strong>${doctorName}</strong>,</p>
            <p style="color:rgba(234,241,255,0.62);font-size:14px;line-height:22px;margin:0 0 24px;">
              Great news — your CureSense doctor account has been <strong style="color:#86EFAC;">approved</strong>.
              You can now sign in and start using your dashboard.
            </p>
            <div style="text-align:center;margin-bottom:28px;">
              <a href="${process.env.FRONTEND_URL || "http://localhost:5173"}/doctor/login"
                style="display:inline-block;background:linear-gradient(135deg,#1D4ED8,#7C3AED);color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;padding:16px 36px;border-radius:12px;">
                Log In to CureSense
              </a>
            </div>
            <p style="color:rgba(234,241,255,0.38);font-size:12px;line-height:20px;margin:0;">
              If you did not create this account, please contact support.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px 32px;border-top:1px solid rgba(255,255,255,0.07);">
            <p style="color:rgba(234,241,255,0.25);font-size:11px;text-align:center;margin:0;">
              &copy; 2026 CureSense &nbsp;&bull;&nbsp; This is an automated message, please do not reply.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  await transporter.sendMail({
    from:    `"CureSense" <${process.env.SMTP_USER}>`,
    to:      toEmail,
    subject: "Your CureSense doctor account has been approved",
    html,
  });
  logger.info({ to: toEmail }, "Doctor approval email sent");
}

async function sendDoctorRejectionEmail(toEmail, doctorName, reason) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn("SMTP_USER or SMTP_PASS not set — skipping email send");
    return;
  }
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#050816;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050816;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#0A1433;border-radius:20px;border:1px solid rgba(255,255,255,0.10);overflow:hidden;max-width:520px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#1D4ED8,#7C3AED);padding:32px 40px;text-align:center;">
            <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
              <td style="background:rgba(255,255,255,0.15);border-radius:14px;padding:10px 14px;">
                <span style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:-0.5px;">&#9889; CureSense</span>
              </td>
            </tr></table>
            <p style="color:rgba(255,255,255,0.75);font-size:13px;margin:14px 0 0;">AI-Powered Healthcare</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <h1 style="color:#EAF1FF;font-size:22px;font-weight:800;margin:0 0 12px;">Account Verification Update</h1>
            <p style="color:rgba(234,241,255,0.75);font-size:15px;line-height:24px;margin:0 0 16px;">Hi <strong>${doctorName}</strong>,</p>
            <p style="color:rgba(234,241,255,0.62);font-size:14px;line-height:22px;margin:0 0 16px;">
              After reviewing your PMDC registration, we were unable to approve your CureSense doctor account at this time.
            </p>
            <div style="background:rgba(239,68,68,0.10);border:1px solid rgba(239,68,68,0.30);border-radius:10px;padding:14px 18px;margin-bottom:24px;">
              <p style="color:rgba(234,241,255,0.55);font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Reason</p>
              <p style="color:#FCA5A5;font-size:14px;margin:0;">${reason || "PMDC information could not be verified."}</p>
            </div>
            <p style="color:rgba(234,241,255,0.62);font-size:14px;line-height:22px;margin:0 0 24px;">
              If you believe this is an error, please contact our support team with your PMDC registration details.
            </p>
            <p style="color:rgba(234,241,255,0.38);font-size:12px;line-height:20px;margin:0;">
              This is an automated notification from CureSense.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px 32px;border-top:1px solid rgba(255,255,255,0.07);">
            <p style="color:rgba(234,241,255,0.25);font-size:11px;text-align:center;margin:0;">
              &copy; 2026 CureSense &nbsp;&bull;&nbsp; This is an automated message, please do not reply.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  await transporter.sendMail({
    from:    `"CureSense" <${process.env.SMTP_USER}>`,
    to:      toEmail,
    subject: "Update on your CureSense doctor account application",
    html,
  });
  logger.info({ to: toEmail }, "Doctor rejection email sent");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Generic activity notification (appointment / payment / message updates).
// Callers go through services/notifyService.js, which checks the user's
// notification preferences first.
async function sendNotificationEmail(toEmail, { subject, heading, lines = [] }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn({ to: toEmail, subject }, "SMTP_USER or SMTP_PASS not set — skipping notification email");
    return;
  }
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
      <h2 style="color:#264296;margin:0 0 16px">${escapeHtml(heading)}</h2>
      ${lines.map((l) => `<p style="font-size:15px;line-height:1.5;margin:0 0 10px">${escapeHtml(l)}</p>`).join("")}
      <p style="font-size:12px;color:#64748b;margin-top:24px">
        You can turn these emails off in CureSense → Settings → Notifications.
      </p>
    </div>`;
  await transporter.sendMail({
    from:    `"CureSense" <${process.env.SMTP_USER}>`,
    to:      toEmail,
    subject,
    html,
  });
}

module.exports = {
  sendNotificationEmail,
  sendVerificationLinkEmail,
  sendPasswordResetLinkEmail,
  sendDoctorRegistrationEmail,
  sendDoctorApprovalEmail,
  sendDoctorRejectionEmail,
};
