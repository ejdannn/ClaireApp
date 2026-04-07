// ─────────────────────────────────────────────────────────
//  CLAIRE UTILS : Shared constants and helpers
// ─────────────────────────────────────────────────────────

const DAYS       = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const START_HOUR = 6;   // 6 AM
const END_HOUR   = 23;  // 11 PM  (last slot ends here)
const TOTAL_SLOTS = (END_HOUR - START_HOUR) * 2; // 34 slots of 30 min

// Convert slot index → "6:00 AM", "6:30 AM", …
function slotToTime(slot) {
  const totalMin = START_HOUR * 60 + slot * 30;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${m === 0 ? '00' : '30'} ${period}`;
}

// Convert slot index → 24h "HH:MM" for datetime-local inputs
function slotTo24h(slot) {
  const totalMin = START_HOUR * 60 + slot * 30;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2,'0')}:${m === 0 ? '00' : '30'}`;
}

// "6:00 AM – 7:00 AM"
function slotRangeLabel(startSlot, endSlot) {
  return `${slotToTime(startSlot)} – ${slotToTime(endSlot)}`;
}

// Generate a short random slug: "book-club-a4x2"
function generateSlug(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${base}-${rand}`;
}

// Format relative date ("2 hours ago", "just now")
function relativeTime(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)   return 'just now';
  if (min < 60)  return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)   return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

// Next occurrence of a weekday (0=Mon) from today
function nextWeekday(dayIndex) {
  const today = new Date();
  const todayDay = (today.getDay() + 6) % 7; // Convert JS Sunday=0 → Monday=0
  let daysAhead = dayIndex - todayDay;
  if (daysAhead <= 0) daysAhead += 7;
  const next = new Date(today);
  next.setDate(today.getDate() + daysAhead);
  return next;
}

// Format date for <input type="date">  →  "YYYY-MM-DD"
function toDateInputValue(date) {
  return date.toISOString().split('T')[0];
}

// ── Toast notifications ──────────────────────────────────
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ── DOM helpers (shared across pages) ───────────────────
function show(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id) { document.getElementById(id)?.classList.add('hidden'); }
function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Copy to clipboard ────────────────────────────────────
async function copyToClipboard(text, successMsg = 'Copied!') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg, 'success');
  } catch {
    // Fallback
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed'; el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select(); document.execCommand('copy');
    el.remove();
    showToast(successMsg, 'success');
  }
}

// ── Heat color for availability overlay ─────────────────
// intensity = 0..1 (fraction of members available)
function heatColor(intensity) {
  if (intensity === 0)    return '#F3F4F6';
  if (intensity <= 0.25)  return '#FEF3C7';
  if (intensity <= 0.50)  return '#FDE68A';
  if (intensity <= 0.75)  return '#FCD34D';
  if (intensity < 1)      return '#F59E0B';
  return '#22C55E'; // all available
}

// ── Recommended meeting times ────────────────────────────
// members: array of {name, availability: {day: [slots]}}
// durationSlots: how many 30-min slots (default 2 = 1 hour)
function getRecommendedTimes(members, durationSlots = 2) {
  if (!members.length) return [];

  // Build matrix[day][slot] = count of available members
  const matrix = Array.from({ length: 7 }, () => new Array(TOTAL_SLOTS).fill(0));
  for (const m of members) {
    const avail = m.availability || {};
    for (let d = 0; d < 7; d++) {
      for (const slot of (avail[d] || [])) {
        if (slot < TOTAL_SLOTS) matrix[d][slot]++;
      }
    }
  }

  const total = members.length;
  const recs  = [];

  for (let d = 0; d < 7; d++) {
    for (let s = 0; s <= TOTAL_SLOTS - durationSlots; s++) {
      // Minimum availability across consecutive slots
      let minCount = Infinity;
      for (let k = s; k < s + durationSlots; k++) minCount = Math.min(minCount, matrix[d][k]);
      if (minCount === 0 || !isFinite(minCount)) continue;

      // Prefer business hours (9am–6pm = slots 6..24)
      const businessScore = (s >= 6 && s + durationSlots <= 24) ? 1 : 0;

      recs.push({
        day: d, startSlot: s, endSlot: s + durationSlots,
        count: minCount, total, allAvailable: minCount === total,
        businessScore,
        label: `${DAYS[d]} ${slotRangeLabel(s, s + durationSlots)}`,
      });
    }
  }

  return recs
    .sort((a, b) =>
      (b.allAvailable - a.allAvailable) ||
      (b.count - a.count) ||
      (b.businessScore - a.businessScore)
    )
    .slice(0, 5);
}

// ── Supabase client ──────────────────────────────────────
function getSupabase() {
  const { supabaseUrl, supabaseAnonKey } = window.CLAIRE_CONFIG;
  if (!supabaseUrl || supabaseUrl === 'YOUR_SUPABASE_URL') {
    throw new Error('Supabase not configured. Please follow SETUP.md.');
  }
  return window.supabase.createClient(supabaseUrl, supabaseAnonKey);
}

// ── Admin session helpers ────────────────────────────────
function saveAdminSession(code) {
  sessionStorage.setItem('claire_admin', '1');
  sessionStorage.setItem('claire_code', code);
}
function getAdminCode() {
  return sessionStorage.getItem('claire_code') || '';
}
function isAdminSession() {
  return sessionStorage.getItem('claire_admin') === '1';
}
function clearAdminSession() {
  sessionStorage.removeItem('claire_admin');
  sessionStorage.removeItem('claire_code');
}

// ── Timezone helpers ─────────────────────────────────────
const TIMEZONES = [
  { value: 'America/New_York',    label: 'Eastern Time (ET)' },
  { value: 'America/Chicago',     label: 'Central Time (CT)' },
  { value: 'America/Denver',      label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage',   label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii (HT)' },
  { value: 'America/Puerto_Rico', label: 'Puerto Rico (AST)' },
  { value: 'Europe/London',       label: 'London (GMT/BST)' },
  { value: 'Europe/Paris',        label: 'Paris (CET)' },
  { value: 'Europe/Berlin',       label: 'Berlin (CET)' },
  { value: 'Asia/Dubai',          label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata',        label: 'India (IST)' },
  { value: 'Asia/Shanghai',       label: 'Shanghai (CST)' },
  { value: 'Asia/Tokyo',          label: 'Tokyo (JST)' },
  { value: 'Asia/Seoul',          label: 'Seoul (KST)' },
  { value: 'Australia/Sydney',    label: 'Sydney (AEST)' },
  { value: 'UTC',                 label: 'UTC' },
];

function getBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
}

// Returns UTC offset in minutes for a given IANA timezone (positive = ahead of UTC)
function getTzOffsetMinutes(tz) {
  const now = new Date();
  const a = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const b = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  return (b - a) / 60000;
}

// Convert a slot from one timezone to another. Returns -1 if outside display range.
function convertSlot(slot, fromTz, toTz) {
  if (!fromTz || !toTz || fromTz === toTz) return slot;
  const diff = Math.round((getTzOffsetMinutes(toTz) - getTzOffsetMinutes(fromTz)) / 30);
  const n = slot + diff;
  return (n >= 0 && n < TOTAL_SLOTS) ? n : -1;
}

// Convert a full availability object to a target timezone
function convertAvailability(avail, fromTz, toTz) {
  if (!fromTz || !toTz || fromTz === toTz) return avail;
  const result = {};
  for (let d = 0; d < 7; d++) {
    result[d] = [];
    for (const s of (avail[d] || [])) {
      const ns = convertSlot(s, fromTz, toTz);
      if (ns !== -1) result[d].push(ns);
    }
  }
  return result;
}

// Build <option> tags for a timezone <select>
function buildTimezoneOptions(selected) {
  return TIMEZONES.map(tz =>
    `<option value="${tz.value}"${tz.value === selected ? ' selected' : ''}>${tz.label}</option>`
  ).join('');
}

// ── Google auth helpers ──────────────────────────────────
function saveGoogleToken(token, expiresIn) {
  localStorage.setItem('claire_gauth', JSON.stringify({
    token, expiry: Date.now() + expiresIn * 1000
  }));
}
function getGoogleToken() {
  const raw = localStorage.getItem('claire_gauth');
  if (!raw) return null;
  const { token, expiry } = JSON.parse(raw);
  return Date.now() < expiry ? token : null;
}
function clearGoogleToken() {
  localStorage.removeItem('claire_gauth');
}
