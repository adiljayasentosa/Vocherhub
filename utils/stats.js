/** Percent change from `previous` to `current`, or null when it can't be meaningfully computed. */
function percentChange(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

module.exports = { percentChange };
