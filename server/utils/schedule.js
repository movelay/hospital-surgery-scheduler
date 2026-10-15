const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::\d{2})?$/;
const STATUSES = new Set(['scheduled', 'completed', 'cancelled']);

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function sendRouteError(res, err, fallback) {
  if (err && err.status) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(fallback, err);
  const detail = err && err.message ? `: ${err.message}` : '';
  return res.status(500).json({ error: `${fallback}${detail}` });
}

function normalizeDate(value) {
  if (typeof value !== 'string') return null;
  const match = DATE_RE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function normalizeTime(value) {
  if (typeof value !== 'string') return null;
  const match = TIME_RE.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${match[1]}:${match[2]}`;
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

module.exports = {
  STATUSES,
  httpError,
  sendRouteError,
  normalizeDate,
  normalizeTime,
  localDateString
};
