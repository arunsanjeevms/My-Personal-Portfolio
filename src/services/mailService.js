'use strict';

/**
 * Outbound email.
 *
 * SMTP settings come from the database first (editable in the admin) and
 * fall back to .env. When neither is configured, send() reports that
 * clearly instead of throwing - email is an enhancement here, never a
 * hard dependency of a user-facing action.
 *
 * The SMTP password is never logged, never returned to a view, and is
 * masked in the settings UI.
 */

const nodemailer = require('nodemailer');
const settingsService = require('./settingsService');
const logger = require('../utils/logger');
const { config } = require('../config/env');
const { escapeHtml } = require('../utils/viewHelpers');

let transporter = null;
let transporterSignature = null;

/** Merges database settings over .env defaults. */
async function getMailConfig() {
  const settings = await settingsService.getAll();

  return {
    host: settings.smtp_host || config.mail.host,
    port: Number(settings.smtp_port) || config.mail.port || 587,
    secure: settings.smtp_secure ?? config.mail.secure,
    user: settings.smtp_user || config.mail.user,
    password: settings.smtp_password || config.mail.password,
    fromName: settings.mail_from_name || config.mail.fromName,
    fromEmail: settings.mail_from_email || config.mail.fromEmail || settings.contact_email,
    replyTo: settings.mail_reply_to || config.mail.replyTo,
    notifyEmail: settings.notify_email || settings.contact_email,
    notifyOnContact: settings.notify_on_contact !== false,
  };
}

function isConfigured(mailConfig) {
  return Boolean(mailConfig.host && mailConfig.fromEmail);
}

/** Cached transport, rebuilt when the settings change. */
async function getTransporter() {
  const mailConfig = await getMailConfig();
  if (!isConfigured(mailConfig)) return null;

  // Password excluded from the signature; host/port/user are enough to
  // detect a meaningful change.
  const signature = `${mailConfig.host}:${mailConfig.port}:${mailConfig.secure}:${mailConfig.user}`;

  if (transporter && transporterSignature === signature) return transporter;

  transporter = nodemailer.createTransport({
    host: mailConfig.host,
    port: mailConfig.port,
    secure: Boolean(mailConfig.secure),
    auth: mailConfig.user ? { user: mailConfig.user, pass: mailConfig.password } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
  });
  transporterSignature = signature;

  return transporter;
}

/** Invalidates the cached transport after a settings change. */
function reset() {
  transporter = null;
  transporterSignature = null;
}

/**
 * @returns {Promise<{sent: boolean, reason?: string, messageId?: string}>}
 */
async function send({ to, subject, html, text, replyTo }) {
  const mailConfig = await getMailConfig();

  if (!isConfigured(mailConfig)) {
    return { sent: false, reason: 'SMTP is not configured. Add it in Settings → Mail.' };
  }

  const recipient = to || mailConfig.notifyEmail;
  if (!recipient) return { sent: false, reason: 'No recipient address is configured.' };

  try {
    const transport = await getTransporter();
    const info = await transport.sendMail({
      from: `"${mailConfig.fromName}" <${mailConfig.fromEmail}>`,
      to: recipient,
      subject,
      text: text || undefined,
      html: html || undefined,
      replyTo: replyTo || mailConfig.replyTo || undefined,
    });

    logger.info('mail: sent', { subject, messageId: info.messageId });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    // Never log the password, even indirectly through a config dump.
    logger.error('mail: send failed', { subject, message: err.message, code: err.code });
    return { sent: false, reason: err.message };
  }
}

/** Wraps content in the portfolio's dark palette. */
function layout(title, bodyHtml) {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#111318;font-family:'Segoe UI',Arial,sans-serif;color:#d6d6d6">
  <div style="max-width:560px;margin:0 auto;background:#1e1e1f;border:1px solid #383838;border-radius:14px;padding:26px">
    <h1 style="margin:0 0 18px;color:#ffdb70;font-size:19px">${escapeHtml(title)}</h1>
    ${bodyHtml}
  </div>
  <p style="max-width:560px;margin:14px auto 0;color:#8a8a8a;font-size:11px;text-align:center">
    Sent by your portfolio CMS.
  </p>
</body></html>`;
}

async function sendContactNotification({ name, email, subject, message, id }) {
  const mailConfig = await getMailConfig();
  if (!mailConfig.notifyOnContact) return { sent: false, reason: 'Contact notifications are switched off.' };

  const rows = [
    ['From', name],
    ['Email', email],
    ['Subject', subject || '(none)'],
  ].map(([label, value]) => `
    <tr>
      <td style="padding:6px 12px 6px 0;color:#8a8a8a;font-size:13px;vertical-align:top">${label}</td>
      <td style="padding:6px 0;color:#fafafa;font-size:13px">${escapeHtml(String(value))}</td>
    </tr>`).join('');

  const html = layout('New contact message', `
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">${rows}</table>
    <div style="border-top:1px solid #383838;padding-top:14px">
      <p style="margin:0 0 6px;color:#8a8a8a;font-size:12px">Message</p>
      <p style="margin:0;color:#d6d6d6;font-size:14px;line-height:1.65;white-space:pre-wrap">${escapeHtml(message)}</p>
    </div>
    <a href="${config.siteUrl}${config.security.adminPath}/messages/${id}"
       style="display:inline-block;margin-top:20px;padding:10px 18px;background:#ffdb70;color:#121212;
              border-radius:8px;text-decoration:none;font-weight:600;font-size:13px">Open in the admin panel</a>`);

  return send({
    subject: `New message from ${name}`,
    html,
    text: `From: ${name} <${email}>\nSubject: ${subject || '(none)'}\n\n${message}`,
    // Replying to the notification replies to the sender.
    replyTo: email,
  });
}

async function sendPasswordReset({ to, name, resetUrl }) {
  const html = layout('Reset your password', `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.65">Hello ${escapeHtml(name || 'there')},</p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.65">
      Someone asked to reset the password for your portfolio admin account.
      This link works once and expires in 60 minutes.
    </p>
    <a href="${resetUrl}" style="display:inline-block;padding:11px 20px;background:#ffdb70;color:#121212;
       border-radius:8px;text-decoration:none;font-weight:600;font-size:13px">Reset password</a>
    <p style="margin:20px 0 0;font-size:12px;color:#8a8a8a;line-height:1.6">
      If this was not you, ignore this email — your password will not change.
    </p>`);

  return send({ to, subject: 'Reset your portfolio admin password', html });
}

async function sendExpiryWarning({ kind, domain, daysRemaining, expiresAt }) {
  const label = kind === 'ssl' ? 'SSL certificate' : 'Domain registration';
  const urgency = daysRemaining <= 7 ? '#e05252' : daysRemaining <= 30 ? '#f5a623' : '#ffdb70';

  const html = layout(`${label} expiring soon`, `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.65">
      The ${label.toLowerCase()} for <strong style="color:#fafafa">${escapeHtml(domain)}</strong>
      expires in <strong style="color:${urgency}">${daysRemaining} day(s)</strong>${expiresAt ? ` (${escapeHtml(String(expiresAt))})` : ''}.
    </p>
    <p style="margin:0;font-size:13px;color:#8a8a8a;line-height:1.6">
      Renew it with your registrar or hosting provider to avoid the site going offline.
    </p>`);

  return send({ subject: `${label} for ${domain} expires in ${daysRemaining} days`, html });
}

/** Used by the "Send test email" button in the admin. */
async function sendTest(to) {
  const html = layout('Test email', `
    <p style="margin:0;font-size:14px;line-height:1.65">
      Your SMTP settings are working. Contact form notifications and password
      reset emails will be delivered.
    </p>`);

  return send({ to, subject: 'Portfolio CMS test email', html });
}

/** Verifies the SMTP connection without sending anything. */
async function verify() {
  const mailConfig = await getMailConfig();
  if (!isConfigured(mailConfig)) return { ok: false, reason: 'SMTP is not configured.' };

  try {
    const transport = await getTransporter();
    await transport.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

module.exports = {
  send,
  sendContactNotification,
  sendPasswordReset,
  sendExpiryWarning,
  sendTest,
  verify,
  isConfigured,
  getMailConfig,
  reset,
};
