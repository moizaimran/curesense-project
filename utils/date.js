// Keep calendar dates as YYYY-MM-DD strings throughout — never use
// new Date("YYYY-MM-DD") for comparisons as it introduces timezone drift.

function normalizeCalendarDate(value) {
  if (!value) return null;
  const date = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return date;
}

function todayCalendarDate() {
  const now = new Date();
  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day   = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

module.exports = { normalizeCalendarDate, todayCalendarDate };
