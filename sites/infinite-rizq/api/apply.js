// Mastermind application handler.
// Validates the form and stores each application as a private JSON file in the
// "infinite-rizq-applications" Vercel Blob store (token: BLOB_READ_WRITE_TOKEN),
// then copies it to the Google Sheet (integrations/google-sheet.gs) when
// SHEET_WEBHOOK_URL and SHEET_WEBHOOK_SECRET are set.
import { put } from '@vercel/blob';

const COMMIT_OPTIONS = ['yes', 'yes-discuss', 'not-now'];
const LIMITS = { name: 120, email: 160, phone: 40, business: 2000, knowShahrez: 2000 };

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'applicant';
}

export function validate(body) {
  const data = {
    name: clean(body.name, LIMITS.name),
    email: clean(body.email, LIMITS.email).toLowerCase(),
    phone: clean(body.phone, LIMITS.phone),
    business: clean(body.business, LIMITS.business),
    commit: clean(body.commit, 20),
    knowShahrez: clean(body.knowShahrez, LIMITS.knowShahrez),
  };
  const errors = {};
  if (data.name.length < 2) errors.name = 'Please enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) errors.email = 'Please enter a valid email.';
  if (data.phone.replace(/\D/g, '').length < 8) errors.phone = 'Please enter a valid WhatsApp number.';
  if (data.business.length < 10) errors.business = 'Tell us a little more about who you are.';
  if (!COMMIT_OPTIONS.includes(data.commit)) errors.commit = 'Please choose an option.';
  if (data.knowShahrez.length < 3) errors.knowShahrez = 'Please answer this question.';
  return { data, errors };
}

// Best effort: Blob storage is the record of truth, so a sheet failure never fails the submission.
export async function sendToSheet(record) {
  const url = process.env.SHEET_WEBHOOK_URL;
  const secret = process.env.SHEET_WEBHOOK_SECRET;
  if (!url || !secret) return;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, type: 'application', data: record }),
      signal: AbortSignal.timeout(8000),
    });
    const result = await resp.json().catch(() => ({}));
    if (!result.ok) console.error('Sheet rejected application', resp.status, result.error);
  } catch (err) {
    console.error('Failed to send application to sheet', err);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch { return res.status(400).json({ ok: false, error: 'Invalid request' }); }
  }

  // Honeypot: real visitors never see or fill this field.
  if (body.website) return res.status(200).json({ ok: true });

  const { data, errors } = validate(body);
  if (Object.keys(errors).length) return res.status(400).json({ ok: false, errors });

  const record = {
    ...data,
    submittedAt: new Date().toISOString(),
    page: clean(body.page, 200),
    utm: typeof body.utm === 'object' && body.utm ? body.utm : {},
    userAgent: clean(req.headers['user-agent'], 300),
    country: clean(req.headers['x-vercel-ip-country'], 8),
  };

  try {
    const stamp = record.submittedAt.replace(/[:.]/g, '-');
    await put(`applications/${stamp}-${slug(data.name)}.json`, JSON.stringify(record, null, 2), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: true,
    });
  } catch (err) {
    console.error('Failed to store application', err);
    return res.status(500).json({ ok: false, error: 'Could not save your application. Please try again.' });
  }

  await sendToSheet(record);
  return res.status(200).json({ ok: true });
}
