import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Read Resend API key: prefer .resendapikey file, fall back to env var
function loadResendKey() {
  const keyFile = path.resolve(__dirname, '../../.resendapikey');
  try {
    const key = fs.readFileSync(keyFile, 'utf8').trim();
    if (key) return key;
  } catch {
    // file not found or unreadable
  }
  return process.env.RESEND_API_KEY || '';
}

const FROM = process.env.FROM_EMAIL || 'noreply@medicosts.acumenus.net';
const APP_URL = process.env.APP_URL || 'https://medicosts.acumenus.net';

// Lazy Resend client — only instantiated when a key is available
function getResend() {
  const key = loadResendKey();
  if (!key) throw new Error('RESEND_API_KEY is not configured. Add it to .resendapikey or .env');
  return new Resend(key);
}

export async function sendTempPassword(toEmail, name, tempPassword) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: 'Your MediCosts access credentials',
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0c0c0e;font-family:Inter,Arial,sans-serif;color:#e4e4e7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c0e;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#141416;border:1px solid #27272a;border-radius:12px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1d3461 0%,#1e3a5f 100%);padding:32px 40px;text-align:center;">
            <div style="font-size:28px;font-weight:800;letter-spacing:-0.03em;color:#e4e4e7;">
              Medi<span style="color:#60a5fa;">Costs</span>
            </div>
            <div style="font-size:13px;color:#71717a;margin-top:6px;letter-spacing:0.3px;text-transform:uppercase;">
              Analytics Dashboard
            </div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 16px;font-size:16px;color:#e4e4e7;">Hi ${name},</p>
            <p style="margin:0 0 24px;font-size:14px;color:#a1a1aa;line-height:1.6;">
              Your MediCosts account has been created. Use the temporary password below to sign in.
              You will be prompted to choose a new password immediately after logging in.
            </p>

            <!-- Temp password block -->
            <div style="background:#0c0c0e;border:1px solid #3b82f6;border-radius:8px;padding:20px 24px;margin:0 0 28px;text-align:center;">
              <div style="font-size:11px;font-weight:600;color:#71717a;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:10px;">
                Temporary Password
              </div>
              <div style="font-family:'Courier New',monospace;font-size:22px;font-weight:700;color:#60a5fa;letter-spacing:0.1em;">
                ${tempPassword}
              </div>
            </div>

            <p style="margin:0 0 28px;font-size:13px;color:#71717a;line-height:1.6;">
              This password is for one-time use only. After signing in you will be required to set a permanent password.
            </p>

            <!-- CTA -->
            <div style="text-align:center;">
              <a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#3b82f6 0%,#2563eb 100%);color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:13px 32px;border-radius:8px;letter-spacing:0.2px;">
                Sign in to MediCosts
              </a>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="border-top:1px solid #27272a;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#52525b;line-height:1.6;">
              If you did not request this account, please ignore this email.<br>
              &copy; ${new Date().getFullYear()} Acumenus Data Sciences
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
    `.trim(),
  });

  if (error) throw new Error(`Email send failed: ${error.message}`);
}
