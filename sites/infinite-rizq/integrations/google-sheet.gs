/**
 * Infinite Rizq — Google Sheet receiver.
 *
 * Paste into the "Infinite Rizq — Attendees & Tickets" sheet:
 *   Extensions → Apps Script → replace everything → Save
 *   Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone → Deploy
 * Put the Web app URL in Vercel as SHEET_WEBHOOK_URL, and the same SECRET as SHEET_WEBHOOK_SECRET.
 */
const SECRET = 'PASTE_SHEET_WEBHOOK_SECRET_HERE';
const SHEET_ID = '1-mqtgE8-SBuDlPhmnH4RmCvmWD-Hh_qk3m30IYD0uy4'; // Infinite Rizq — Attendees & Tickets

const COMMIT_LABELS = {
  'yes': "Yes, I'm ready to commit",
  'yes-discuss': 'Yes, but wants to discuss details',
  'not-now': 'Not right now',
};

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return reply({ ok: false, error: 'bad json' }); }
  if (!body || body.secret !== SECRET) return reply({ ok: false, error: 'unauthorized' });

  if (body.type === 'kpis') return reply({ ok: true, data: salesKpis() });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
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

// Sales sanity metrics for the /dashboard, read straight from the Tickets tab.
// Only rows with Payment Verified = Yes count as sold.
function salesKpis() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const rows = ss.getSheetByName('Tickets').getDataRange().getValues().slice(1);
  const tiers = {
    'General': { bookings: 0, seats: 0, revenue: 0 },
    'Pair Pass': { bookings: 0, seats: 0, revenue: 0 },
    'Inner Table': { bookings: 0, seats: 0, revenue: 0 },
  };
  const k = { bookings: 0, seats: 0, revenue: 0, pending: 0, notIssued: 0, checkedIn: 0, tiers: tiers };
  rows.forEach(function (r) {
    if (!String(r[2]).trim()) return; // no name, unused ticket ID
    const verified = String(r[11]).trim();
    if (verified !== 'Yes') { if (verified !== 'No') k.pending++; return; }
    const seats = Number(r[4]) || 1, amount = Number(r[9]) || 0, t = tiers[String(r[3]).trim()];
    k.bookings++; k.seats += seats; k.revenue += amount;
    if (t) { t.bookings++; t.seats += seats; t.revenue += amount; }
    if (String(r[12]).trim() !== 'Yes') k.notIssued++;
    if (String(r[14]).trim() === 'Yes') k.checkedIn += seats;
  });
  const apps = ss.getSheetByName('Mastermind Applications');
  k.applications = apps ? Math.max(0, apps.getLastRow() - 1) : 0;
  k.asOf = new Date().toISOString();
  return k;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
