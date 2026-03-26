// ─────────────────────────────────────────────────────────
//  CLAIRE : Group availability form (group.html)
// ─────────────────────────────────────────────────────────

let db, groupData, existingMember;

// availability[day] = Set of available slot indices
const availability = {};
for (let d = 0; d < 7; d++) availability[d] = new Set();

let activeMobileDay = 0;
let isDragging = false;
let dragAction  = 'add'; // 'add' | 'remove'

// ── Timezone selector ─────────────────────────────────────
(function initTzSelect() {
  const sel = document.getElementById('memberTimezone');
  if (!sel) return;
  const browser = getBrowserTimezone();
  sel.innerHTML = buildTimezoneOptions(browser);
})();

// ── Init ─────────────────────────────────────────────────
(async function init() {
  try { db = getSupabase(); } catch (e) {
    showConfigError(e.message); return;
  }

  const slug = getSlugFromURL();
  if (!slug) { showNotFound(); return; }

  await loadGroup(slug);
})();

function getSlugFromURL() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (id) return id;
  // Also handle /g/:slug via path
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] === 'g' && parts[1]) return parts[1];
  return null;
}

async function loadGroup(slug) {
  const { data, error } = await db
    .from('groups')
    .select('*')
    .eq('slug', slug)
    .single();

  hide('groupLoadingHeader');
  if (error || !data) { showNotFound(); return; }

  groupData = data;
  document.getElementById('groupNameDisplay').textContent = data.name;
  document.getElementById('groupDescDisplay').textContent = data.description || 'Fill in your general weekly availability below.';
  document.title = `${data.name} : Claire`;
  show('groupHeaderContent');
  document.getElementById('groupBody').style.display = '';

  buildDesktopGrid();
  buildMobileGrid();
}

// ── Step 1: Name + email ──────────────────────────────────
document.getElementById('step1NextBtn').addEventListener('click', handleStep1);
document.getElementById('memberEmail').addEventListener('blur', checkExistingMember);

async function handleStep1() {
  const name  = document.getElementById('memberName').value.trim();
  const email = document.getElementById('memberEmail').value.trim().toLowerCase();
  const err   = document.getElementById('step1Error');

  if (!name)  { showEl(err, 'Please enter your name.'); return; }
  if (!email || !email.includes('@')) { showEl(err, 'Please enter a valid email.'); return; }
  err.classList.add('hidden');

  goToStep2();
}

async function checkExistingMember() {
  if (!groupData) return;
  const email = document.getElementById('memberEmail').value.trim().toLowerCase();
  if (!email.includes('@')) return;

  const { data } = await db
    .from('members')
    .select('*')
    .eq('group_id', groupData.id)
    .eq('email', email)
    .single();

  if (data) {
    existingMember = data;
    // Pre-fill name
    if (!document.getElementById('memberName').value) {
      document.getElementById('memberName').value = data.name;
    }
    // Load existing availability
    const avail = data.availability || {};
    for (let d = 0; d < 7; d++) {
      availability[d] = new Set(avail[d] || []);
    }
    // Pre-fill timezone if stored
    if (avail.tz) {
      const tzSel = document.getElementById('memberTimezone');
      if (tzSel) tzSel.value = avail.tz;
    }
    // Refresh the grid so existing slots are visually shown
    refreshDesktopGrid();
    refreshMobileSlots();
    show('returningNotice');
  } else {
    existingMember = null;
    hide('returningNotice');
  }
}

function goToStep2() {
  document.getElementById('step1Panel').classList.remove('active');
  document.getElementById('step2Panel').classList.add('active');
  document.getElementById('step1Dot').classList.remove('active');
  document.getElementById('step1Dot').classList.add('done');
  document.getElementById('step1Dot').textContent = '✓';
  document.getElementById('stepLine1').classList.add('done');
  document.getElementById('step2Dot').classList.add('active');
  refreshDesktopGrid();
  refreshMobileSlots();
  window.scrollTo(0, 0);
}

document.getElementById('step2BackBtn').addEventListener('click', () => {
  document.getElementById('step2Panel').classList.remove('active');
  document.getElementById('step1Panel').classList.add('active');
  document.getElementById('step1Dot').classList.add('active');
  document.getElementById('step1Dot').classList.remove('done');
  document.getElementById('step1Dot').textContent = '1';
  document.getElementById('stepLine1').classList.remove('done');
  document.getElementById('step2Dot').classList.remove('active');
  window.scrollTo(0, 0);
});

// ── Desktop grid ──────────────────────────────────────────
function buildDesktopGrid() {
  const grid = document.getElementById('desktopGrid');
  let html = '';

  // Empty top-left corner
  html += '<div></div>';
  // Day headers
  for (const d of DAYS_SHORT) {
    html += `<div class="avail-grid-day-label">${d}</div>`;
  }

  // Rows (time slots)
  for (let s = 0; s < TOTAL_SLOTS; s++) {
    const time = slotToTime(s);
    const isHour = s % 2 === 0;
    const label  = isHour ? time : '';
    html += `<div class="avail-grid-time ${isHour ? 'hour' : ''}">${label}</div>`;
    for (let d = 0; d < 7; d++) {
      html += `<div class="avail-slot" data-day="${d}" data-slot="${s}"></div>`;
    }
  }

  grid.innerHTML = html;

  // Drag-to-select
  grid.addEventListener('mousedown', e => {
    const slot = e.target.closest('.avail-slot');
    if (!slot) return;
    e.preventDefault();
    isDragging = true;
    const d = +slot.dataset.day, s = +slot.dataset.slot;
    dragAction = availability[d].has(s) ? 'remove' : 'add';
    toggleSlot(d, s);
    refreshDesktopGrid();
  });

  grid.addEventListener('mouseover', e => {
    if (!isDragging) return;
    const slot = e.target.closest('.avail-slot');
    if (!slot) return;
    toggleSlot(+slot.dataset.day, +slot.dataset.slot);
    refreshDesktopGrid();
  });

  document.addEventListener('mouseup', () => { isDragging = false; });

  // Touch support
  grid.addEventListener('touchstart', e => {
    const slot = e.target.closest('.avail-slot');
    if (!slot) return;
    isDragging = true;
    const d = +slot.dataset.day, s = +slot.dataset.slot;
    dragAction = availability[d].has(s) ? 'remove' : 'add';
    toggleSlot(d, s);
    refreshDesktopGrid();
  }, { passive: true });

  grid.addEventListener('touchmove', e => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const slot = el?.closest('.avail-slot');
    if (slot) { toggleSlot(+slot.dataset.day, +slot.dataset.slot); refreshDesktopGrid(); }
  }, { passive: true });

  grid.addEventListener('touchend', () => { isDragging = false; });

  refreshDesktopGrid();
}

function refreshDesktopGrid() {
  document.querySelectorAll('.avail-slot').forEach(el => {
    const d = +el.dataset.day, s = +el.dataset.slot;
    el.classList.toggle('on', availability[d].has(s));
  });
}

// ── Mobile grid ───────────────────────────────────────────
function buildMobileGrid() {
  // Day tabs
  const tabsEl = document.getElementById('dayTabs');
  tabsEl.innerHTML = DAYS_SHORT.map((d, i) =>
    `<button class="day-tab-btn ${i === 0 ? 'active' : ''}" data-day="${i}">${d}</button>`
  ).join('');

  tabsEl.querySelectorAll('.day-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tabsEl.querySelectorAll('.day-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeMobileDay = +btn.dataset.day;
      refreshMobileSlots();
    });
  });

  refreshMobileSlots();
}

function refreshMobileSlots() {
  const list = document.getElementById('mobileSlotList');
  let html = '';
  for (let s = 0; s < TOTAL_SLOTS; s++) {
    const on = availability[activeMobileDay].has(s);
    html += `<div class="mobile-slot ${on ? 'on' : ''}" data-slot="${s}">
      <span class="mobile-slot-time">${slotToTime(s)}</span>
      <span class="mobile-slot-check">${on ? '✓' : ''}</span>
    </div>`;
  }
  list.innerHTML = html;

  list.querySelectorAll('.mobile-slot').forEach(el => {
    el.addEventListener('click', () => {
      toggleSlot(activeMobileDay, +el.dataset.slot);
      refreshMobileSlots();
    });
  });
}

function toggleSlot(day, slot) {
  if (dragAction === 'add') {
    availability[day].add(slot);
  } else {
    availability[day].delete(slot);
  }
}

// ── Quick-select helpers ──────────────────────────────────
document.getElementById('clearAllBtn').addEventListener('click', () => {
  for (let d = 0; d < 7; d++) availability[d].clear();
  refreshDesktopGrid(); refreshMobileSlots();
});

document.getElementById('selectWeekdaysBtn').addEventListener('click', () => {
  // Mon-Fri, 9am–5pm = slots 6..19
  for (let d = 0; d < 5; d++) {
    for (let s = 6; s < 22; s++) availability[d].add(s); // 9am–5pm
  }
  refreshDesktopGrid(); refreshMobileSlots();
});

document.getElementById('selectEveningsBtn').addEventListener('click', () => {
  // Mon-Sun, 6pm–9pm = slots 24..29
  for (let d = 0; d < 7; d++) {
    for (let s = 24; s < 30; s++) availability[d].add(s);
  }
  refreshDesktopGrid(); refreshMobileSlots();
});

// ── Submit ────────────────────────────────────────────────
document.getElementById('submitBtn').addEventListener('click', submitAvailability);

async function submitAvailability() {
  const name  = document.getElementById('memberName').value.trim();
  const email = document.getElementById('memberEmail').value.trim().toLowerCase();
  const errEl = document.getElementById('submitError');
  errEl.classList.add('hidden');

  // Serialize availability
  const avail = {};
  for (let d = 0; d < 7; d++) {
    avail[d] = [...availability[d]].sort((a, b) => a - b);
  }
  // Store member's timezone so admin can convert correctly
  avail.tz = document.getElementById('memberTimezone')?.value || getBrowserTimezone();

  setSubmitLoading(true);

  try {
    if (existingMember) {
      // Update existing
      const { error } = await db
        .from('members')
        .update({ name, availability: avail, updated_at: new Date().toISOString() })
        .eq('id', existingMember.id);
      if (error) throw error;
    } else {
      // Insert new (upsert handles race conditions)
      const { error } = await db
        .from('members')
        .upsert({ group_id: groupData.id, name, email, availability: avail }, { onConflict: 'group_id,email' });
      if (error) throw error;
    }

    showDoneState();
  } catch (e) {
    showEl(errEl, `Something went wrong: ${e.message}`);
  } finally {
    setSubmitLoading(false);
  }
}

function setSubmitLoading(on) {
  const btn = document.getElementById('submitBtn');
  btn.disabled = on;
  document.getElementById('submitBtnText').classList.toggle('hidden', on);
  document.getElementById('submitSpinner').classList.toggle('hidden', !on);
}

function showDoneState() {
  document.getElementById('step2Panel').classList.remove('active');
  document.getElementById('donePanelWrap').style.display = 'block';
  document.getElementById('step2Dot').classList.remove('active');
  document.getElementById('step2Dot').classList.add('done');
  document.getElementById('step2Dot').textContent = '✓';
  window.scrollTo(0, 0);
}

document.getElementById('editAgainBtn').addEventListener('click', () => {
  document.getElementById('donePanelWrap').style.display = 'none';
  document.getElementById('step2Panel').classList.add('active');
  document.getElementById('step2Dot').classList.add('active');
  document.getElementById('step2Dot').classList.remove('done');
  document.getElementById('step2Dot').textContent = '2';
  window.scrollTo(0, 0);
});

// ── Error / not-found states ──────────────────────────────
function showNotFound() {
  hide('groupLoadingHeader');
  show('groupNotFound');
}
function showConfigError(msg) {
  hide('groupLoadingHeader');
  show('groupNotFound');
  document.getElementById('groupNotFound').innerHTML =
    `<h1>Configuration Error</h1><p class="text-muted">${msg}<br/>See SETUP.md to configure the app.</p>`;
}

// ── DOM helpers ───────────────────────────────────────────
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function showEl(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }
