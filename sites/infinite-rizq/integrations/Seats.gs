// Seats.gs: the second file in the Infinite Rizq Apps Script project (Code.gs is the first).
// Replace this whole file in Apps Script, then Deploy > Manage deployments > Edit > New version.

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
    let ticketId = p.ticket_ref || '';
    if (!/^Yes/.test(linked)) {
      const ref = addToTickets(p);
      if (ref) { tab.getRange(row, 9).setValue('Yes, ' + ref.label); seatAdmin('link', passId, ref.id); ticketId = ref.id; }
    }
    if (p.email) {
      MailApp.sendEmail({ to: p.email, bcc: 'walianwaar3@gmail.com', name: 'Infinite Rizq', subject: 'Your Infinite Rizq ticket is confirmed: ' + rowsFor(p.tier), htmlBody: confirmEmailNishat(p) });
      markIssued(ticketId, p.ticket_id);
      note('Confirmed, email sent.');
    } else {
      note('Confirmed. No email on file: send the pass link on WhatsApp.');
    }
  } finally {
    lock.releaseLock();
  }
}

// "Confirm payment" on the dashboard: the same as choosing Paid in the Status column of the Seat Passes tab.
// A script edit does not fire the edit trigger, so this sets Paid and runs onSeatEdit on that cell itself.
function approvePass(passId) {
  if (!passId) return { ok: false, error: 'No pass given.' };
  const tab = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SEAT_TAB);
  if (!tab || tab.getLastRow() < 2) return { ok: false, error: 'The Seat Passes tab is empty.' };
  const ids = tab.getRange(2, 2, tab.getLastRow() - 1, 1).getValues();
  let row = -1;
  for (let i = ids.length - 1; i >= 0; i--) { if (String(ids[i][0]).trim() === passId) { row = i + 2; break; } }
  if (row < 0) return { ok: false, error: passId + ' is not on the Seat Passes tab.' };
  const cell = tab.getRange(row, 3), notes = tab.getRange(row, 10);
  if (String(cell.getValue()).trim() === 'Paid' && /Confirmed/.test(String(notes.getValue()))) return { ok: true, message: 'Already confirmed.' };
  const before = String(notes.getValue());
  cell.setValue('Paid');
  onSeatEdit({ range: cell });
  const after = String(notes.getValue()).slice(before.length).replace(/^ · /, '');
  if (/ERROR/.test(after)) return { ok: false, error: after };
  return { ok: true, message: after || 'Confirmed.' };
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

// The confirmation email is the ticket: tick "Ticket Issued" and date it on the buyer's Tickets row.
function markIssued(ticketId, passId) {
  const t = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Tickets');
  const rows = t.getRange(2, 1, Math.max(1, t.getLastRow() - 1), 16).getValues();
  for (let i = 0; i < rows.length; i++) {
    const id = String(rows[i][0]).trim(), notes = String(rows[i][15]);
    if ((ticketId && id === ticketId) || (passId && notes.indexOf('(' + passId + ')') >= 0)) {
      t.getRange(i + 2, 13, 1, 2).setValues([['Yes', Utilities.formatDate(new Date(), 'Asia/Karachi', 'dd MMM yyyy')]]);
      return;
    }
  }
}

function seatText(seats, short) {
  seats = seats || [];
  if (short) return seats.join(', ');
  if (seats.length === 2 && seats[0][0] === seats[1][0]) return 'Row ' + seats[0][0] + ', Seats ' + Number(seats[0].slice(2)) + ' and ' + Number(seats[1].slice(2));
  return seats.map(function (s) { return 'Row ' + s[0] + ', Seat ' + Number(s.slice(2)); }).join(' + ');
}

// Nishat Hotel: tickets name their rows only; the exact seat is given on arrival.
function rowsFor(tier) {
  return { inner: 'Front row, sofa seating', pair: 'Rows 2 to 4, seated together', general: 'Rows 5 to 7', back: 'Back rows' }[tier] || 'Seat given on arrival';
}

function confirmEmailNishat(p) {
  const esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  const first = esc(String(p.name || '').split(' ')[0] || 'there');
  const link = SITE + '/seats?t=' + encodeURIComponent(p.token);
  const tierName = { inner: 'Inner Table', general: 'General Admission', pair: 'Pair Pass', back: 'Main Hall' }[p.tier] || p.tier;
  const row = function (k, v) { return '<tr><td style="padding:4px 14px 4px 0;color:#8a857b;font-size:12px;letter-spacing:.1em;text-transform:uppercase">' + k + '</td><td style="padding:4px 0;color:#f3ede1">' + v + '</td></tr>'; };
  return '<div style="background:#0a0a0b;padding:28px 16px;font-family:Helvetica,Arial,sans-serif;color:#c9c3b6">' +
    '<div style="max-width:520px;margin:0 auto;background:#16161a;border:1px solid #6b5520;border-radius:16px;padding:26px 22px">' +
    '<div style="color:#d4a73a;font-size:12px;letter-spacing:.2em;text-transform:uppercase;font-weight:bold">Ticket confirmed</div>' +
    '<h1 style="font-family:Georgia,serif;color:#f3ede1;font-size:26px;margin:8px 0 6px">' + esc(rowsFor(p.tier)) + '</h1>' +
    '<p style="margin:0 0 16px">' + first + ', your payment is confirmed and your Infinite Rizq ticket is issued in your name. Your exact seat is given to you on arrival.</p>' +
    '<table style="border-collapse:collapse;font-size:14px">' +
      row('Name', esc(p.name)) + row('Pass', esc(p.ticket_id)) + row('Ticket', esc(tierName) + (p.tier === 'pair' ? ' (admits two)' : '')) +
      row('Seating', esc(rowsFor(p.tier)) + ' · seat given on arrival') +
      row('When', 'Saturday 17 October 2026, 10 AM to 4:30 PM') + row('Where', 'Grand Ballroom D, Nishat Hotel, Johar Town, Lahore') +
    '</table>' +
    '<p style="margin:16px 0 0;font-size:13px">Good news: after the response to Infinite Rizq we upgraded the venue and the day, and added tea and snacks for every guest.' + (p.tier === 'inner' ? ' As an Inner Table guest you have a separate buffet in a private sitting inside the hotel.' : '') + '</p>' +
    '<p style="margin:20px 0"><a href="' + link + '" style="display:inline-block;background:#e8c66a;color:#141005;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:10px">View your ticket</a></p>' +
    '<p style="margin:0;font-size:13px">Show your ticket at the door. For any change, <a href="' + WHATSAPP + '" style="color:#e8c66a">WhatsApp our Event Coordinator</a> with your pass number.</p>' +
    '</div></div>';
}
