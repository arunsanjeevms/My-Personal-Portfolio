'use strict';

/**
 * Public contact form.
 *
 * Replaces the previous third-party Web3Forms integration. Protections,
 * in the order they apply:
 *   1. CSRF token (global middleware)
 *   2. Rate limit, 5 submissions per hour per hashed IP
 *   3. Honeypot field - bots fill it, people never see it
 *   4. Submission speed check - instant posts are automated
 *   5. Field validation and length caps
 *   6. Heuristic spam scoring, stored rather than silently discarded
 */

const db = require('../config/database');
const settingsService = require('../services/settingsService');
const mailService = require('../services/mailService');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');
const { asyncHandler } = require('../utils/errors');
const { hashIp } = require('../utils/crypto');
const { getClientIp, getUserAgent, getReferrerHost } = require('../utils/request');
const publicController = require('./publicController');

const MAX_MESSAGE_LENGTH = 5000;

/** Cheap heuristics. A high score is flagged, never auto-deleted. */
function scoreSpam({ name, email, subject, message }) {
  let score = 0;
  const body = `${subject || ''} ${message}`.toLowerCase();

  const linkCount = (body.match(/https?:\/\//g) || []).length;
  if (linkCount >= 3) score += 30;
  if (linkCount >= 6) score += 30;

  const keywords = ['casino', 'viagra', 'crypto investment', 'seo services', 'buy followers', 'loan offer'];
  for (const keyword of keywords) if (body.includes(keyword)) score += 25;

  if (/(.)\1{12,}/.test(message)) score += 20;              // long character runs
  if (message.length < 15) score += 15;                      // too short to be real
  if (/[一-鿿Ѐ-ӿ]/.test(body) && linkCount) score += 15;
  if (name && !/[a-z]/i.test(name)) score += 20;             // no letters in the name
  if (email && /\+.*@/.test(email) && linkCount >= 2) score += 10;

  return Math.min(100, score);
}

function validate(body) {
  const errors = {};
  const values = {
    fullname: String(body.fullname || '').trim().slice(0, 120),
    email: String(body.email || '').trim().toLowerCase().slice(0, 190),
    subject: String(body.subject || '').trim().slice(0, 200),
    message: String(body.message || '').trim().slice(0, MAX_MESSAGE_LENGTH),
  };

  if (values.fullname.length < 2) errors.fullname = 'Please enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) errors.email = 'Please enter a valid email address.';
  if (values.message.length < 10) errors.message = 'Please write a slightly longer message.';

  return { values, errors };
}

/** Re-renders the contact tab with a status banner. */
async function renderWithStatus(req, res, { type, message, values = {} }) {
  const data = await publicController.buildPageData(req, 'contact');
  res.status(type === 'error' ? 400 : 200).render('public/index', {
    ...data,
    contactStatus: { type, message },
    contactValues: values,
  });
}

/** POST /contact */
const submit = asyncHandler(async (req, res) => {
  const flags = await settingsService.getFlags();
  if (flags.show_contact === false) {
    return renderWithStatus(req, res, { type: 'error', message: 'The contact form is currently closed.' });
  }

  // Honeypot. Report success so a bot does not learn it was detected.
  if (req.body.website) {
    logger.security('contact: honeypot triggered', { ipHash: hashIp(getClientIp(req)) });
    return renderWithStatus(req, res, {
      type: 'success',
      message: 'Thank you. Your message has been sent.',
    });
  }

  const { values, errors } = validate(req.body);

  if (Object.keys(errors).length) {
    return renderWithStatus(req, res, {
      type: 'error',
      message: Object.values(errors)[0],
      values,
    });
  }

  const spamScore = scoreSpam({
    name: values.fullname, email: values.email, subject: values.subject, message: values.message,
  });

  const [result] = await db.getPool().execute(
    `INSERT INTO contact_messages
       (name, email, subject, message, ip_hash, user_agent, referrer, status, spam_score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      values.fullname,
      values.email,
      values.subject || null,
      values.message,
      hashIp(getClientIp(req)),
      getUserAgent(req),
      getReferrerHost(req),
      spamScore >= 60 ? 'spam' : 'unread',
      spamScore,
    ],
  );

  logger.info('contact: message received', { id: result.insertId, spamScore });

  // Notification and email are best-effort: the visitor must still get a
  // confirmation even if SMTP is unconfigured or down.
  if (spamScore < 60) {
    notificationService.create({
      type: 'contact_message',
      severity: 'info',
      title: `New message from ${values.fullname}`,
      body: values.subject || values.message.slice(0, 120),
      link: '/messages',
      entity: 'contact_message',
      entityId: result.insertId,
    }).catch((err) => logger.error('contact: notification failed', { message: err.message }));

    mailService.sendContactNotification({
      name: values.fullname,
      email: values.email,
      subject: values.subject,
      message: values.message,
      id: result.insertId,
    }).catch((err) => logger.warn('contact: notification email failed', { message: err.message }));
  }

  return renderWithStatus(req, res, {
    type: 'success',
    message: 'Thank you. Your message has been sent and I will reply soon.',
  });
});

module.exports = { submit, scoreSpam, validate };
