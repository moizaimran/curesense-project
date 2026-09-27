const nodemailer = require("nodemailer");
const logger     = require("../utils/logger");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function _otpEmailHtml(otp, type) {
  const isVerify  = type === "email_verification";
  const heading   = isVerify ? "Verify your email address" : "Reset your password";
  const bodyLine  = isVerify
    ? "Use the code below to verify your CureSense account. It expires in <strong>15 minutes</strong>."
    : "Use the code below to reset your CureSense password. It expires in <strong>15 minutes</strong>.";
  const warning   = isVerify
    ? "If you did not create a CureSense account, you can safely ignore this email."
    : "If you did not request a password reset, you can safely ignore this email.";

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

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1D4ED8,#7C3AED);padding:32px 40px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="background:rgba(255,255,255,0.15);border-radius:14px;padding:10px 14px;display:inline-block;">
                    <span style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:-0.5px;">&#9889; CureSense</span>
                  </td>
                </tr>
              </table>
              <p style="color:rgba(255,255,255,0.75);font-size:13px;margin:14px 0 0;letter-spacing:0.3px;">AI-Powered Healthcare</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h1 style="color:#EAF1FF;font-size:22px;font-weight:800;margin:0 0 12px;letter-spacing:-0.4px;">${heading}</h1>
              <p style="color:rgba(234,241,255,0.62);font-size:14px;line-height:22px;margin:0 0 28px;">${bodyLine}</p>

              <!-- OTP box -->
              <div style="background:#0D1E50;border:1.5px solid rgba(59,130,246,0.35);border-radius:16px;padding:28px;text-align:center;margin-bottom:28px;">
                <p style="color:rgba(234,241,255,0.45);font-size:11px;font-weight:700;letter-spacing:2px;margin:0 0 12px;text-transform:uppercase;">Your verification code</p>
                <span style="color:#60A5FA;font-size:44px;font-weight:900;letter-spacing:12px;">${otp}</span>
                <p style="color:rgba(234,241,255,0.35);font-size:11px;margin:14px 0 0;">Expires in 15 minutes</p>
              </div>

              <p style="color:rgba(234,241,255,0.38);font-size:12px;line-height:20px;margin:0;">${warning}</p>
            </td>
          </tr>

          <!-- Footer -->
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

async function sendOTPEmail(toEmail, otp, type) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn("SMTP_USER or SMTP_PASS not set — skipping email send");
    return;
  }

  const subject = type === "email_verification"
    ? "Your CureSense verification code"
    : "Reset your CureSense password";

  await transporter.sendMail({
    from:    `"CureSense" <${process.env.SMTP_USER}>`,
    to:      toEmail,
    subject,
    html:    _otpEmailHtml(otp, type),
  });

  logger.info({ to: toEmail, type }, "OTP email sent");
}

module.exports = { sendOTPEmail, sendVerificationLinkEmail, sendPasswordResetLinkEmail };
