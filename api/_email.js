// api/_email.js — Alpha Quantum ERP v16 — SMTP Email via IONOS
// Uses IONOS SMTP: smtp.ionos.com:587
// From: erp@alpha-01.info | Reply-To: reply@alpha-01.info

export async function sendEmail({ to, subject, html, text, replyTo }) {
  const host = process.env.SMTP_HOST || 'smtp.ionos.com';
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER || 'erp@alpha-01.info';
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'Alpha Quantum ERP <erp@alpha-01.info>';
  const replyToAddr = replyTo || process.env.SMTP_REPLY_TO || 'reply@alpha-01.info';

  if (!pass) {
    console.warn('[Email] SMTP_PASS not set, skipping email send');
    return { ok: false, error: 'SMTP not configured' };
  }

  // Build raw SMTP message via nodemailer-compatible approach
  // We use raw fetch to a simple SMTP relay endpoint or nodemailer if available
  try {
    // Dynamic import nodemailer (available in Node.js environments)
    const nodemailer = await import('nodemailer').catch(() => null);
    if (!nodemailer) {
      console.warn('[Email] nodemailer not available');
      return { ok: false, error: 'nodemailer not installed' };
    }

    const transporter = nodemailer.default.createTransport({
      host, port,
      secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });

    const info = await transporter.sendMail({
      from,
      to: Array.isArray(to) ? to.join(', ') : to,
      replyTo: replyToAddr,
      subject,
      html: html || text,
      text: text || html?.replace(/<[^>]+>/g, '') || '',
    });

    console.log(`[Email] Sent to ${to}: ${info.messageId}`);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error('[Email] Send failed:', err.message);
    return { ok: false, error: err.message };
  }
}

// Pre-built email templates
export function expenseApprovedTemplate(userName, ref, amount, status) {
  const color = status === 'approved' ? '#10b981' : '#f43f5e';
  const label = status === 'approved' ? 'Approved ✓' : 'Rejected ✗';
  return {
    subject: `Expense ${ref} ${label} — Alpha Quantum ERP`,
    html: `
      <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#0e1420;color:#eef2ff;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.1)">
        <div style="background:linear-gradient(135deg,#3b82f6,#8b5cf6);padding:28px 32px">
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#fff">Alpha Quantum ERP</h1>
          <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.7);letter-spacing:2px;text-transform:uppercase">erp.alpha-01.info</p>
        </div>
        <div style="padding:32px">
          <h2 style="color:${color};margin:0 0 16px;font-size:18px">Expense ${label}</h2>
          <p style="color:#7c89ab;margin:0 0 8px">Hello <strong style="color:#eef2ff">${userName}</strong>,</p>
          <p style="color:#7c89ab;margin:0 0 24px">Your expense request has been <strong style="color:${color}">${status}</strong>.</p>
          <div style="background:#182034;border-radius:8px;padding:16px;border:1px solid rgba(255,255,255,0.08)">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#7c89ab">Reference</span><strong style="color:#eef2ff">${ref}</strong></div>
            <div style="display:flex;justify-content:space-between"><span style="color:#7c89ab">Amount</span><strong style="color:#eef2ff">SAR ${parseFloat(amount||0).toLocaleString('en-SA')}</strong></div>
          </div>
          <p style="margin:24px 0 0;color:#3f4d6b;font-size:12px">Login at <a href="https://erp.alpha-01.info" style="color:#3b82f6">erp.alpha-01.info</a> for details.</p>
        </div>
      </div>`,
  };
}

export function welcomeUserTemplate(fullName, username, password, cubeSlug) {
  return {
    subject: 'Your Alpha Quantum ERP Account — Welcome!',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#0e1420;color:#eef2ff;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.1)">
        <div style="background:linear-gradient(135deg,#3b82f6,#8b5cf6);padding:28px 32px">
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#fff">Welcome to Alpha Quantum ERP</h1>
        </div>
        <div style="padding:32px">
          <p style="color:#7c89ab;margin:0 0 24px">Hello <strong style="color:#eef2ff">${fullName}</strong>, your account is ready.</p>
          <div style="background:#182034;border-radius:8px;padding:16px;border:1px solid rgba(255,255,255,0.08)">
            <div style="margin-bottom:8px"><span style="color:#7c89ab">URL: </span><a href="https://erp.alpha-01.info" style="color:#3b82f6">erp.alpha-01.info</a></div>
            <div style="margin-bottom:8px"><span style="color:#7c89ab">Username: </span><strong style="color:#eef2ff">${username}</strong></div>
            <div><span style="color:#7c89ab">Password: </span><strong style="color:#eef2ff">${password}</strong></div>
          </div>
          <p style="margin:16px 0 0;color:#f59e0b;font-size:12px">⚠️ Please change your password after first login.</p>
          <p style="margin:24px 0 0;color:#3f4d6b;font-size:12px">Support: <a href="mailto:erp@alpha-01.info" style="color:#3b82f6">erp@alpha-01.info</a></p>
        </div>
      </div>`,
  };
}
