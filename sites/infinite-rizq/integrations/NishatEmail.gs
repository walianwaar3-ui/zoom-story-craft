// NishatEmail.gs: paste as a new file in Apps Script (Infinite Rizq sheet).
// Ticket confirmation email for the Nishat Hotel venue: rows only, seat given on arrival.

// Nishat Hotel: tickets name their rows only; the exact seat is given on arrival.
function rowsFor(tier) {
  return { inner: 'Front row, sofa seating', pair: 'Rows 2 to 4, seated together', general: 'Rows 5 to 7', back: 'Rows 8 to 20' }[tier] || 'Seat given on arrival';
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
