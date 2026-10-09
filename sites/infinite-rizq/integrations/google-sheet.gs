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

const SEAT_TAB = 'Seat Passes';
const SEAT_HEADERS = ['Issued At', 'Pass', 'Status', 'Ticket Type', 'Seats', 'Full Name', 'Email', 'WhatsApp', 'In Tickets tab', 'Notes'];
const TIER_LABELS = { inner: 'Inner Table', general: 'General', pair: 'Pair Pass', back: 'Back Rows' };
const TIER_PRICES = { inner: '33,333', general: '11,111', pair: '15,555', back: '5,555' };
const SITE = 'https://www.infiniterizq.com';
const WHATSAPP = 'https://wa.me/13322332380';

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
    if (body.type === 'seat') return reply(recordSeat(ss, body.data || {}));
    return reply({ ok: false, error: 'unknown type' });
  } finally {
    lock.releaseLock();
  }
}

// A seat pass was issued on infiniterizq.com/seats. Log it on the Seat Passes tab and,
// when it belongs to a paid ticket (IR-xxx), write the seat into that ticket's row.
// Pending passes (P-xxx) are holds from people whose email did not match a payment yet.
function recordSeat(ss, d) {
  const seats = (d.seats || []).join(', ');
  let tab = ss.getSheetByName(SEAT_TAB);
  if (!tab) {
    tab = ss.insertSheet(SEAT_TAB);
    tab.appendRow(SEAT_HEADERS);
    tab.getRange(1, 1, 1, SEAT_HEADERS.length).setFontWeight('bold');
    tab.setFrozenRows(1);
  }
  let matched = 'No';
  const tickets = ss.getSheetByName('Tickets');
  const ids = tickets.getRange(2, 1, Math.max(1, tickets.getLastRow() - 1), 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() !== d.ticketId) continue;
    const row = i + 2;
    tickets.getRange(row, 17).setValue(seats); // Q: Seat
    if (d.phone && !String(tickets.getRange(row, 7).getValue()).trim()) tickets.getRange(row, 7).setValue("'" + d.phone); // G: WhatsApp
    matched = 'Yes, row ' + row;
    break;
  }
  tab.appendRow([
    new Date(d.issuedAt || Date.now()), d.ticketId || '',
    d.status === 'verified' ? 'Paid' : 'Pending: match payment',
    TIER_LABELS[d.tier] || d.tier || '', seats, d.name || '', d.email || '', "'" + (d.phone || ''), matched, '',
  ]);
  return { ok: true, matched: matched };
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

// ---------------------------------------------------------------------------------------------
// Confirming payments from the Seat Passes tab.
// Change a row's Status (column C) to "Paid" and this: confirms the seat on the website,
// adds the buyer to the Tickets tab (if they are not there yet), and emails them their seat pass.
// "Released" frees the seat so someone else can take it.
// One-time setup: in Apps Script, choose the function setupSeatTrigger and press Run, then allow access.
function setupSeatTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onSeatEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onSeatEdit').forSpreadsheet(SHEET_ID).onEdit().create();
}

function onSeatEdit(e) {
  const range = e && e.range;
  if (!range || range.getSheet().getName() !== SEAT_TAB || range.getColumn() !== 3 || range.getRow() < 2 || range.getNumRows() > 1) return;
  const status = String(range.getValue()).trim();
  if (status !== 'Paid' && status !== 'Released') return;
  const tab = range.getSheet(), row = range.getRow();
  const passId = String(tab.getRange(row, 2).getValue()).trim();
  const note = function (t) {
    const c = tab.getRange(row, 10), old = String(c.getValue()).trim();
    c.setValue((old ? old + ' · ' : '') + t + ' ' + Utilities.formatDate(new Date(), 'Asia/Karachi', 'dd MMM HH:mm'));
  };
  if (!passId) return;

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const res = seatAdmin(status === 'Paid' ? 'verify' : 'release', passId, '');
    if (!res.ok) { note('ERROR: ' + (res.error || 'site did not respond') + ', try again.'); return; }
    const p = res.data;
    if (status === 'Released') { tab.getRange(row, 5).setValue(''); note('Released, seat freed.'); return; }

    // Add to Tickets once, so sales numbers and check-in count this buyer.
    const linked = String(tab.getRange(row, 9).getValue()).trim();
    if (!/^Yes/.test(linked)) {
      const ref = addToTickets(p);
      if (ref) { tab.getRange(row, 9).setValue('Yes, ' + ref.label); seatAdmin('link', passId, ref.id); }
    }
    if (p.email) {
      MailApp.sendEmail({ to: p.email, bcc: 'walianwaar3@gmail.com', name: 'Infinite Rizq', subject: 'Your seat is confirmed: ' + seatText(p.seats), htmlBody: confirmEmail(p) });
      note('Confirmed, email sent.');
    } else {
      note('Confirmed. No email on file: send the pass link on WhatsApp.');
    }
  } finally {
    lock.releaseLock();
  }
}

function seatAdmin(action, ticketId, ref) {
  const resp = UrlFetchApp.fetch(SITE + '/api/seats', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ admin: action, secret: SECRET, ticketId: ticketId, ref: ref }),
  });
  try { return JSON.parse(resp.getContentText()); } catch (err) { return { ok: false, error: 'HTTP ' + resp.getResponseCode() }; }
}

// Fills the first unused ticket ID row (has an ID, no name) on the Tickets tab.
function addToTickets(p) {
  const ss = SpreadsheetApp.openById(SHEET_ID), t = ss.getSheetByName('Tickets');
  const rows = t.getRange(2, 1, Math.max(1, t.getLastRow() - 1), 3).getValues();
  let r = -1;
  for (let i = 0; i < rows.length; i++) { if (String(rows[i][0]).trim() && !String(rows[i][2]).trim()) { r = i + 2; break; } }
  if (r < 0) { r = t.getLastRow() + 1; t.getRange(r, 1).setValue('IR-' + ('00' + (r - 1)).slice(-3)); }
  const id = String(t.getRange(r, 1).getValue()).trim();
  const today = Utilities.formatDate(new Date(), 'Asia/Karachi', 'dd MMM yyyy');
  t.getRange(r, 2, 1, 16).setValues([[
    today, p.name || '', TIER_LABELS[p.tier] || p.tier, p.tier === 'pair' ? '2' : '1', '', p.phone ? "'" + p.phone : '',
    p.email || '', 'To confirm', TIER_PRICES[p.tier] || '', '', 'Yes', '', '', 'No',
    'Confirmed from Seat Passes (' + p.ticket_id + '). Fill payment method and ref.', seatText(p.seats, true),
  ]]);
  return { id: id, label: 'row ' + r + ' (' + id + ')' };
}

function seatText(seats, short) {
  seats = seats || [];
  if (short) return seats.join(', ');
  if (seats.length === 2 && seats[0][0] === seats[1][0]) return 'Row ' + seats[0][0] + ', Seats ' + Number(seats[0].slice(2)) + ' and ' + Number(seats[1].slice(2));
  return seats.map(function (s) { return 'Row ' + s[0] + ', Seat ' + Number(s.slice(2)); }).join(' + ');
}

function confirmEmail(p) {
  const esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  const first = esc(String(p.name || '').split(' ')[0] || 'there');
  const link = SITE + '/seats?t=' + encodeURIComponent(p.token);
  const row = function (k, v) { return '<tr><td style="padding:4px 14px 4px 0;color:#8a857b;font-size:12px;letter-spacing:.1em;text-transform:uppercase">' + k + '</td><td style="padding:4px 0;color:#f3ede1">' + v + '</td></tr>'; };
  return '<div style="background:#0a0a0b;padding:28px 16px;font-family:Helvetica,Arial,sans-serif;color:#c9c3b6">' +
    '<div style="max-width:520px;margin:0 auto;background:#16161a;border:1px solid #6b5520;border-radius:16px;padding:26px 22px">' +
    '<div style="color:#d4a73a;font-size:12px;letter-spacing:.2em;text-transform:uppercase;font-weight:bold">Seat confirmed</div>' +
    '<h1 style="font-family:Georgia,serif;color:#f3ede1;font-size:26px;margin:8px 0 6px">' + esc(seatText(p.seats)) + '</h1>' +
    '<p style="margin:0 0 16px">' + first + ', your payment is confirmed and your seat at Infinite Rizq is reserved in your name.</p>' +
    '<table style="border-collapse:collapse;font-size:14px">' +
      row('Name', esc(p.name)) + row('Pass', esc(p.ticket_id)) + row('Ticket', esc(TIER_LABELS[p.tier] || p.tier) + (p.tier === 'pair' ? ' (admits two)' : '')) +
      row('Seat' + ((p.seats || []).length === 2 ? 's' : ''), esc((p.seats || []).join(', '))) +
      row('When', 'Saturday 17 October 2026, 12 PM to 4 PM') + row('Where', 'Auditorium 2, Expo Center Lahore') +
    '</table>' +
    '<p style="margin:20px 0"><a href="' + link + '" style="display:inline-block;background:#e8c66a;color:#141005;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:10px">View your seat pass</a></p>' +
    '<p style="margin:0;font-size:13px">Show your seat pass at the door. Your seat is final; for an urgent change, <a href="' + WHATSAPP + '" style="color:#e8c66a">WhatsApp our Event Coordinator</a> with your pass number.</p>' +
    '</div></div>';
}
