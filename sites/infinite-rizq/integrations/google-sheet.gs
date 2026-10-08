/**
 * Infinite Rizq — Google Sheet receiver.
 *
 * Paste into the "Infinite Rizq — Attendees & Tickets" sheet:
 *   Extensions → Apps Script → replace everything → Save
 *   Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone → Deploy
 * Put the Web app URL in Vercel as SHEET_WEBHOOK_URL, and the same SECRET as SHEET_WEBHOOK_SECRET.
 */
const SECRET = 'PASTE_SHEET_WEBHOOK_SECRET_HERE';

const COMMIT_LABELS = {
  'yes': "Yes, I'm ready to commit",
  'yes-discuss': 'Yes, but wants to discuss details',
  'not-now': 'Not right now',
};

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return reply({ ok: false, error: 'bad json' }); }
  if (!body || body.secret !== SECRET) return reply({ ok: false, error: 'unauthorized' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (body.type === 'application') {
      const a = body.data || {};
      ss.getSheetByName('Mastermind Applications').appendRow([
        new Date(a.submittedAt || Date.now()),
        a.name || '', a.email || '', "'" + (a.phone || ''), a.business || '',
        COMMIT_LABELS[a.commit] || a.commit || '', a.knowShahrez || '',
        'New', '', '', a.country ? 'Country: ' + a.country : '',
      ]);
      return reply({ ok: true });
    }
    return reply({ ok: false, error: 'unknown type' });
  } finally {
    lock.releaseLock();
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
