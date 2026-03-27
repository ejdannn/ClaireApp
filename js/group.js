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
document.getElementById('memberName').addEventListener('blur', checkExistingMember);

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

  // ── 1. Check this group first (existing member updating their response) ──
  const { data: thisGroupMatch } = await db
    .from('members')
    .select('*')
    .eq('group_id', groupData.id)
    .eq('email', email)
    .single();

  if (thisGroupMatch) {
    existingMember = thisGroupMatch;
    if (!document.getElementById('memberName').value) {
      document.getElementById('memberName').value = thisGroupMatch.name;
    }
    applyAvailability(thisGroupMatch.availability);
    show('returningNotice');
    hide('prefillNotice');
    return;
  }

  // ── 2. Not in this group yet. Check other groups for a pre-fill match ──
  existingMember = null;
  hide('returningNotice');

  let crossMatch = null;

  // 2a. Match by email across other groups
  const { data: emailMatches } = await db
    .from('members')
    .select('*')
    .eq('email', email)
    .neq('group_id', groupData.id)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (emailMatches?.length) {
    crossMatch = emailMatches[0];
  }

  // 2b. If no email match, try fuzzy name match across other groups
  if (!crossMatch) {
    const name = document.getElementById('memberName').value.trim();
    if (name.length >= 2) {
      const { data: nameMatches } = await db
        .from('members')
        .select('*')
        .ilike('name', name)
        .neq('group_id', groupData.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (nameMatches?.length) crossMatch = nameMatches[0];
    }
  }

  if (crossMatch) {
    // Pre-fill name if blank
    if (!document.getElementById('memberName').value) {
      document.getElementById('memberName').value = crossMatch.name;
    }
    applyAvailability(crossMatch.availability);
    show('prefillNotice');
  } else {
    hide('prefillNotice');
  }
}

// Loads an availability object into the grid (used for both returning + pre-fill)
function applyAvailability(avail) {
  const a = avail || {};
  for (let d = 0; d < 7; d++) {
    availability[d] = new Set(a[d] || []);
  }
  if (a.tz) {
    const tzSel = document.getElementById('memberTimezone');
    if (tzSel) tzSel.value = a.tz;
  }
  refreshDesktopGrid();
  refreshMobileSlots();
  animateSlotPopIn();
}

function animateSlotPopIn() {
  const cells = document.querySelectorAll('.avail-slot.on');
  let i = 0;
  cells.forEach(el => {
    const delay = Math.min(i * 8, 400);
    setTimeout(() => el.classList.add('slot-popin'), delay);
    setTimeout(() => el.classList.remove('slot-popin'), delay + 350);
    i++;
  });
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
  // Day headers with copy button
  for (let d = 0; d < DAYS_SHORT.length; d++) {
    html += `<div class="avail-grid-day-label">
      ${DAYS_SHORT[d]}
      <button class="copy-day-btn" data-day="${d}" title="Copy from another day" tabindex="-1">⊕</button>
    </div>`;
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

  // Copy-day buttons
  grid.querySelectorAll('.copy-day-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openCopyPopover(btn, +btn.dataset.day);
    });
  });

  // Drag-to-select
  grid.addEventListener('mousedown', e => {
    const slot = e.target.closest('.avail-slot');
    if (!slot) return;
    e.preventDefault();
    isDragging = true;
    const d = +slot.dataset.day, s = +slot.dataset.slot;
    dragAction = availability[d].has(s) ? 'remove' : 'add';
    toggleSlot(d, s);
    addSlotRipple(slot);
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
      highlightMobileCopyActive();
    });
  });

  buildMobileCopyRow();
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

// ── Copy day ──────────────────────────────────────────────
let activeCopyPopover = null;

function openCopyPopover(anchorBtn, targetDay) {
  closeCopyPopover();

  const popover = document.createElement('div');
  popover.className = 'copy-day-popover';
  popover.innerHTML = `
    <div class="copy-day-popover-label">Copy from:</div>
    <div class="copy-day-popover-days">
      ${DAYS_SHORT.map((d, i) => i === targetDay ? '' :
        `<button class="copy-day-option" data-from="${i}">${d}</button>`
      ).join('')}
    </div>`;

  popover.querySelectorAll('.copy-day-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const fromDay = +btn.dataset.from;
      availability[targetDay] = new Set(availability[fromDay]);
      refreshDesktopGrid();
      refreshMobileSlots();
      closeCopyPopover();
      flashCopiedDay(targetDay);
    });
  });

  anchorBtn.parentElement.style.position = 'relative';
  anchorBtn.parentElement.appendChild(popover);
  activeCopyPopover = popover;

  // Close when clicking outside
  setTimeout(() => document.addEventListener('click', closeCopyPopover, { once: true }), 0);
}

function closeCopyPopover() {
  if (activeCopyPopover) { activeCopyPopover.remove(); activeCopyPopover = null; }
}

function addSlotRipple(el) {
  const ripple = document.createElement('span');
  ripple.className = 'slot-ripple';
  el.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}

function flashCopiedDay(day) {
  document.querySelectorAll(`.avail-slot[data-day="${day}"].on`).forEach((el, i) => {
    setTimeout(() => {
      el.classList.add('slot-copy-flash');
      el.addEventListener('animationend', () => el.classList.remove('slot-copy-flash'), { once: true });
    }, i * 6);
  });
}

// Mobile: "Copy from" row shown below day tabs
function buildMobileCopyRow() {
  const wrap = document.getElementById('mobileCopyRow');
  if (!wrap) return;
  wrap.innerHTML = `
    <span class="mobile-copy-label">Copy from:</span>
    ${DAYS_SHORT.map((d, i) =>
      `<button class="mobile-copy-day-btn" data-day="${i}">${d}</button>`
    ).join('')}`;

  wrap.querySelectorAll('.mobile-copy-day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const fromDay = +btn.dataset.day;
      if (fromDay === activeMobileDay) return;
      availability[activeMobileDay] = new Set(availability[fromDay]);
      refreshMobileSlots();
      refreshDesktopGrid();
      flashCopiedDay(activeMobileDay);
    });
  });
}

function highlightMobileCopyActive() {
  document.querySelectorAll('.mobile-copy-day-btn').forEach(btn => {
    btn.classList.toggle('is-active-day', +btn.dataset.day === activeMobileDay);
  });
}

// ── Quick-select helpers ──────────────────────────────────
document.getElementById('clearAllBtn').addEventListener('click', () => {
  for (let d = 0; d < 7; d++) availability[d].clear();
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

    setSubmitLoading(false);
    pulseSavedCells().then(() => showDoneState());
  } catch (e) {
    showEl(errEl, `Something went wrong: ${e.message}`);
    setSubmitLoading(false);
  }
}

function pulseSavedCells() {
  return new Promise(resolve => {
    const cells = document.querySelectorAll('.avail-slot.on, .mobile-slot.on');
    cells.forEach(el => el.classList.add('slot-saved-pulse'));
    // Remove class after animation and resolve
    setTimeout(() => {
      cells.forEach(el => el.classList.remove('slot-saved-pulse'));
      resolve();
    }, 600);
  });
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
