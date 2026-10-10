const now = Date.now();
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function generateDailyBuckets(days) {
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const ms = now - i * 24 * 3600 * 1000;
    const istMs = ms + (5.5 * 3600 * 1000);
    const istD = new Date(istMs);
    const y = istD.getUTCFullYear();
    const m = String(istD.getUTCMonth() + 1).padStart(2, '0');
    const d = String(istD.getUTCDate()).padStart(2, '0');
    const bucketKey = `${y}-${m}-${d}`;
    const timeLabel = `${d} ${MONTH_NAMES[istD.getUTCMonth()]}`;
    buckets.push({ bucketKey, timeLabel });
  }
  return buckets;
}

console.log('7D Buckets:');
console.log(generateDailyBuckets(7));

console.log('\n24H Buckets:');
function generateHourlyBuckets() {
  const buckets = [];
  for (let i = 23; i >= 0; i--) {
    const ms = now - i * 3600 * 1000;
    const istMs = ms + (5.5 * 3600 * 1000);
    const istD = new Date(istMs);
    const y = istD.getUTCFullYear();
    const m = String(istD.getUTCMonth() + 1).padStart(2, '0');
    const d = String(istD.getUTCDate()).padStart(2, '0');
    const h = String(istD.getUTCHours()).padStart(2, '0');
    const bucketKey = `${y}-${m}-${d} ${h}:00`;
    const timeLabel = `${h}:00`;
    buckets.push({ bucketKey, timeLabel });
  }
  return buckets;
}
console.log(generateHourlyBuckets().slice(-5));
