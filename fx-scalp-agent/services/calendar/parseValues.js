/**
 * Parse economic release strings: "272K", "0.3%", "4.25", "1.2M".
 */
function parseNumeric(raw) {
  if (raw == null || raw === '' || raw === '—' || raw === '-') return null;
  let s = String(raw).trim().replace(/,/g, '');
  if (!s || s.toLowerCase() === 'n/a') return null;

  let mult = 1;
  const last = s.slice(-1).toUpperCase();
  if (last === 'K') {
    mult = 1000;
    s = s.slice(0, -1);
  } else if (last === 'M') {
    mult = 1_000_000;
    s = s.slice(0, -1);
  } else if (last === 'B') {
    mult = 1_000_000_000;
    s = s.slice(0, -1);
  } else if (s.endsWith('%')) {
    s = s.slice(0, -1);
  }

  const n = Number(s);
  return Number.isFinite(n) ? n * mult : null;
}

module.exports = { parseNumeric };
