// ─────────────────────────────────────────────────────────
//  CLAIRE : Admin dashboard (admin.html)
// ─────────────────────────────────────────────────────────

// ── Confetti ──────────────────────────────────────────────
function launchConfetti() {
  const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#f43f5e'];
  const COUNT  = 90;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
  canvas.width  = innerWidth;
  canvas.height = innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const pieces = Array.from({ length: COUNT }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * -canvas.height * 0.5,
    r: 5 + Math.random() * 6,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.2,
    vx: (Math.random() - 0.5) * 4,
    vy: 2 + Math.random() * 4,
    shape: Math.random() < 0.5 ? 'rect' : 'circle',
  }));
  let frame;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of pieces) {
      p.x += p.vx; p.y += p.vy; p.angle += p.spin; p.vy += 0.12;
      if (p.y < canvas.height + 20) alive = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - p.y / (canvas.height * 1.1));
      if (p.shape === 'rect') {
        ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
      } else {
        ctx.beginPath(); ctx.arc(0, 0, p.r * 0.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    if (alive) { frame = requestAnimationFrame(draw); }
    else { cancelAnimationFrame(frame); canvas.remove(); }
  }
  frame = requestAnimationFrame(draw);
  setTimeout(() => { cancelAnimationFrame(frame); canvas.remove(); }, 4000);
}

let db, currentGroup, groupMembers = [], googleTokenClient;
let allGroups = []; // full list — filter/sort operates on this

// ── Admin timezone ────────────────────────────────────────
function getAdminTimezone() {
  return localStorage.getItem('claire_admin_tz') || getBrowserTimezone();
}
function setAdminTimezone(tz) {
  localStorage.setItem('claire_admin_tz', tz);
}

// Returns groupMembers with availability converted to admin's viewing timezone
function getMembersInAdminTz() {
  const adminTz = getAdminTimezone();
  return groupMembers.map(m => {
    const memberTz = m.availability?.tz;
    if (!memberTz || memberTz === adminTz) return m;
    // convertAvailability works on {key: [slots]} regardless of key type (day index or date string)
    return { ...m, availability: convertAvailability(m.availability, memberTz, adminTz) };
  });
}

// ── Specific-dates scheduling mode ───────────────────────
let createGroupMode  = 'weekly';
let createGroupDates = [];   // ISO date strings for create modal
let editGroupMode    = 'weekly';
let editGroupDates   = [];   // ISO date strings for edit modal

function createSetMode(mode) {
  createGroupMode = mode;
  document.getElementById('createModeWeeklyBtn').classList.toggle('active', mode === 'weekly');
  document.getElementById('createModeSpecificBtn').classList.toggle('active', mode === 'specific_dates');
  const wrap = document.getElementById('createDatePickerWrap');
  if (mode === 'specific_dates') {
    wrap.classList.remove('hidden');
    _renderAdminDatePicker('createDatePickerWrap', createGroupDates, d => { createGroupDates = d; });
  } else {
    wrap.classList.add('hidden');
  }
}

function editSetMode(mode) {
  editGroupMode = mode;
  document.getElementById('editModeWeeklyBtn').classList.toggle('active', mode === 'weekly');
  document.getElementById('editModeSpecificBtn').classList.toggle('active', mode === 'specific_dates');
  const wrap = document.getElementById('editDatePickerWrap');
  if (mode === 'specific_dates') {
    wrap.classList.remove('hidden');
    _renderAdminDatePicker('editDatePickerWrap', editGroupDates, d => { editGroupDates = d; });
  } else {
    wrap.classList.add('hidden');
  }
}

// Admin calendar date-multi-picker
// wrapperId: id of container div; selectedDates: mutable array of ISO strings; onChange(dates) callback
function _renderAdminDatePicker(wrapperId, selectedDates, onChange) {
  const wrap = document.getElementById(wrapperId);
  if (!wrap) return;
  const now = new Date();
  // Store nav state on the element
  if (!wrap._pickerYear)  wrap._pickerYear  = now.getFullYear();
  if (!wrap._pickerMonth) wrap._pickerMonth = now.getMonth();

  const render = () => {
    const yr = wrap._pickerYear, mo = wrap._pickerMonth;
    const monthName = new Date(yr, mo, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    const firstDay  = new Date(yr, mo, 1).getDay(); // 0=Sun
    const daysInMo  = new Date(yr, mo + 1, 0).getDate();

    // Header row (Mon-first: Mon=0 … Sun=6)
    const dayHeaders = ['Mo','Tu','We','Th','Fr','Sa','Su']
      .map(d => `<div style="text-align:center;font-size:0.72rem;font-weight:700;color:var(--text-muted);padding:0.2rem 0;">${d}</div>`)
      .join('');

    // Offset: convert Sun=0 to Mon-first offset
    const offset = (firstDay + 6) % 7;
    const blanks  = Array(offset).fill('<div></div>').join('');

    const dayCells = Array.from({ length: daysInMo }, (_, i) => {
      const day   = i + 1;
      const iso   = `${yr}-${String(mo + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const sel   = selectedDates.includes(iso);
      return `<div onclick="_adminPickerToggle('${wrapperId}','${iso}')"
        style="text-align:center;padding:0.3rem 0;border-radius:50%;cursor:pointer;font-size:0.85rem;
          ${sel ? 'background:var(--primary);color:#fff;font-weight:700;' : 'color:var(--text);'}
          transition:background 0.12s;"
        onmouseenter="this.style.opacity='0.8'"
        onmouseleave="this.style.opacity='1'">${day}</div>`;
    }).join('');

    // Selected date pills
    const sorted = [...selectedDates].sort();
    const pills  = sorted.map(iso => {
      const d = new Date(iso + 'T00:00:00');
      const label = d.toLocaleDateString('default', { month: 'short', day: 'numeric' });
      return `<span style="display:inline-flex;align-items:center;gap:0.25rem;background:var(--primary-pale);color:var(--primary-deeper);
        border-radius:99px;padding:0.15rem 0.5rem;font-size:0.75rem;font-weight:600;">
        ${label}
        <span onclick="_adminPickerToggle('${wrapperId}','${iso}')" style="cursor:pointer;font-size:0.8rem;line-height:1;">✕</span>
      </span>`;
    }).join('');

    wrap.innerHTML = `
      <div style="border:1.5px solid var(--border);border-radius:10px;padding:0.75rem;background:var(--surface);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">
          <button type="button" class="btn btn-ghost btn-sm" style="padding:0.2rem 0.5rem;"
            onclick="_adminPickerNav('${wrapperId}',-1)">‹</button>
          <span style="font-size:0.85rem;font-weight:700;">${monthName}</span>
          <button type="button" class="btn btn-ghost btn-sm" style="padding:0.2rem 0.5rem;"
            onclick="_adminPickerNav('${wrapperId}',1)">›</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:0.15rem;">
          ${dayHeaders}${blanks}${dayCells}
        </div>
        ${pills ? `<div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-top:0.6rem;">${pills}</div>` : ''}
        ${!selectedDates.length ? '<p class="text-muted" style="font-size:0.75rem;margin-top:0.4rem;">Click dates to select them.</p>' : ''}
      </div>`;
    // stash callback so toggle/nav can call it
    wrap._onChange = onChange;
    wrap._selectedDates = selectedDates;
  };
  render();
  wrap._pickerRender = render;
}

function _adminPickerNav(wrapperId, delta) {
  const wrap = document.getElementById(wrapperId);
  if (!wrap) return;
  wrap._pickerMonth += delta;
  if (wrap._pickerMonth > 11) { wrap._pickerMonth = 0; wrap._pickerYear++; }
  if (wrap._pickerMonth < 0)  { wrap._pickerMonth = 11; wrap._pickerYear--; }
  wrap._pickerRender?.();
}

function _adminPickerToggle(wrapperId, iso) {
  const wrap = document.getElementById(wrapperId);
  if (!wrap) return;
  const dates = wrap._selectedDates;
  const idx   = dates.indexOf(iso);
  if (idx >= 0) dates.splice(idx, 1);
  else          dates.push(iso);
  wrap._onChange?.(dates);
  wrap._pickerRender?.();
}

// ── Init ─────────────────────────────────────────────────
(async function init() {
  // Guard: must be admin
  if (!isAdminSession()) {
    window.location.href = '/';
    return;
  }

  try { db = getSupabase(); } catch (e) {
    showToast(e.message, 'error'); return;
  }

  setupGoogleAuth();
  await loadGroups();
  bindUI();

  // Restore last active tab
  const lastView = (() => { try { return localStorage.getItem('claire_admin_view'); } catch { return null; } })();
  if (lastView && lastView !== 'schedules') switchMainView(lastView);
})();


// ── Load all groups ───────────────────────────────────────
async function loadGroups() {
  show('groupsLoading'); hide('groupsGrid'); hide('groupsEmpty');

  const { data, error } = await db
    .from('groups')
    .select('*, members(email, name)')
    .order('created_at', { ascending: false });

  hide('groupsLoading');

  if (error) { showToast('Failed to load groups.', 'error'); return; }

  allGroups = data || [];
  document.getElementById('schedulesToolbar').style.display = allGroups.length ? '' : 'none';

  if (!allGroups.length) {
    show('groupsEmpty'); return;
  }

  applyScheduleFilters();
  show('groupsGrid');
}

// Returns a 0–100 completion % for a group
function groupCompletionPct(g) {
  const members  = g.members || [];
  const expected = g.expected_members || [];
  if (!expected.length) return -1; // no expected list set
  const respondedEmails    = new Set(members.map(m => m.email?.toLowerCase()));
  const respondedUsernames = new Set(members.map(m => emailUsername(m.email || '')).filter(Boolean));
  const respondedNames     = new Set(members.map(m => m.name?.toLowerCase()));
  const matched = expected.filter(e => {
    const lower = e.toLowerCase();
    if (lower.includes('@')) {
      if (respondedEmails.has(lower)) return true;
      const uname = emailUsername(lower);
      return uname ? respondedUsernames.has(uname) : false;
    }
    return Array.from(respondedNames).some(n => n.includes(lower) || lower.includes(n));
  }).length;
  return Math.round((matched / expected.length) * 100);
}

function applyScheduleFilters() {
  const filter = document.querySelector('.filter-chip.active')?.dataset.filter || 'all';
  const sort   = document.getElementById('scheduleSort')?.value || 'newest';

  let groups = [...allGroups];

  // Filter
  if (filter === 'needs') {
    groups = groups.filter(g => {
      const pct = groupCompletionPct(g);
      return pct >= 0 && pct < 100 && !localStorage.getItem(`claire_scheduled_${g.id}`);
    });
  } else if (filter === 'ready') {
    groups = groups.filter(g => groupCompletionPct(g) === 100 && !localStorage.getItem(`claire_scheduled_${g.id}`));
  } else if (filter === 'scheduled') {
    groups = groups.filter(g => !!localStorage.getItem(`claire_scheduled_${g.id}`));
  }

  // Sort
  if (sort === 'oldest') {
    groups.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } else if (sort === 'az') {
    groups.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === 'pct_desc') {
    groups.sort((a, b) => groupCompletionPct(b) - groupCompletionPct(a));
  } else if (sort === 'pct_asc') {
    groups.sort((a, b) => {
      const pa = groupCompletionPct(a), pb = groupCompletionPct(b);
      // Put groups with no expected list last
      if (pa < 0 && pb < 0) return 0;
      if (pa < 0) return 1;
      if (pb < 0) return -1;
      return pa - pb;
    });
  } else {
    // newest (default)
    groups.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  const grid = document.getElementById('groupsGrid');

  if (!groups.length) {
    grid.innerHTML = `<div class="schedules-filter-empty" style="grid-column:1/-1;">No schedules match this filter.</div>`;
    show('groupsGrid'); hide('groupsEmpty');
    return;
  }

  hide('groupsEmpty'); show('groupsGrid');
  renderGroupCards(groups);
}

function renderGroupCards(groups) {
  const grid = document.getElementById('groupsGrid');
  grid.innerHTML = groups.map(g => {
    const members  = g.members || [];
    const count    = members.length; // total responders (for badge)
    const expected = g.expected_members || [];
    const link     = groupLink(g.slug);

    // Progress bar: reuse groupCompletionPct
    const showBar  = expected.length > 0;
    const rawPct   = groupCompletionPct(g);
    const matchedCount = showBar ? Math.round(rawPct / 100 * expected.length) : 0;
    const pct      = showBar ? Math.max(0, rawPct) : 0;
    const barColor = pct === 100 ? 'var(--success)' : pct >= 50 ? 'var(--primary)' : 'var(--danger)';
    const progressHtml = showBar ? `
      <div class="group-card-progress">
        <div class="group-card-progress-bar">
          <div class="group-card-progress-fill" style="width:0%;background:${barColor};" data-pct="${pct}"></div>
        </div>
        <span class="group-card-progress-label">${matchedCount} / ${expected.length} responded</span>
      </div>` : '';

    const scheduledAt = localStorage.getItem(`claire_scheduled_${g.id}`);
    const bannerHtml = scheduledAt
      ? `<div class="group-card-banner scheduled"><span class="icon-emoji">✅</span> Scheduled!</div>`
      : (pct === 100 && showBar)
        ? `<div class="group-card-banner ready"><span class="icon-emoji">🎉</span> Ready to schedule!</div>`
        : '';

    return `
    <div class="group-card" data-group-id="${g.id}">
      <div class="group-card-name">${escHtml(g.name)}</div>
      <div class="group-card-meta">
        <span class="badge badge-primary">${count} member${count !== 1 ? 's' : ''}</span>
        &nbsp; Created ${relativeTime(g.created_at)}
      </div>
      ${progressHtml}
      ${bannerHtml}
      <div class="group-card-actions">
        <button class="btn btn-primary btn-sm view-group-btn" data-group="${escHtml(JSON.stringify(g))}">View</button>
        <button class="btn btn-ghost btn-sm edit-group-btn" data-group="${escHtml(JSON.stringify(g))}">Edit</button>
        <button class="btn btn-ghost btn-sm copy-link-btn" data-link="${link}">Copy Link</button>
        <button class="btn-icon btn-danger delete-group-btn" data-group-id="${g.id}" data-group-name="${escHtml(g.name)}" title="Delete group" style="font-size:1.1rem;padding:0.3rem 0.5rem;">✕</button>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.view-group-btn').forEach(btn =>
    btn.addEventListener('click', () => openGroupDetail(JSON.parse(btn.dataset.group)))
  );
  grid.querySelectorAll('.edit-group-btn').forEach(btn =>
    btn.addEventListener('click', () => openEditScheduleModal(JSON.parse(btn.dataset.group)))
  );
  grid.querySelectorAll('.copy-link-btn').forEach(btn =>
    btn.addEventListener('click', () => copyToClipboard(btn.dataset.link, 'Link copied!'))
  );
  grid.querySelectorAll('.delete-group-btn').forEach(btn =>
    btn.addEventListener('click', () => confirmDeleteGroup(btn.dataset.groupId, btn.dataset.groupName))
  );

  // Animate progress bars from 0 to real value
  requestAnimationFrame(() => requestAnimationFrame(() => {
    grid.querySelectorAll('.group-card-progress-fill').forEach(el => {
      el.style.width = (el.dataset.pct || 0) + '%';
    });
  }));
}

function groupLink(slug) {
  return `${window.location.origin}/g/${slug}`;
}

// ── Group detail ──────────────────────────────────────────
async function openGroupDetail(group) {
  currentGroup = group;
  show('groupDetailView'); hide('groupsView');

  document.getElementById('detailGroupName').textContent = group.name;
  const link = groupLink(group.slug);
  document.getElementById('detailGroupLink').textContent = link;
  document.getElementById('detailCopyLinkBtn').onclick = () => copyToClipboard(link, 'Link copied!');
  document.getElementById('detailScheduleBtn').onclick = openScheduleModal;
  document.getElementById('detailExportBtn').onclick   = exportToSheets;

  await loadGroupMembers(group.id);
  // Load contacts silently so name lookup works in the pending section
  if (!contactGroups.length) ensureContactsLoaded();
  switchTab('members');
}

async function ensureContactsLoaded() {
  try {
    const res = await fetch(`/api/contacts?adminCode=${encodeURIComponent(getAdminCode())}`);
    const data = await res.json();
    if (res.ok && data.length) {
      contactGroups = data;
      // Re-render pending now that we have name data
      renderPending();
    }
  } catch { /* silent */ }
}

async function loadGroupMembers(groupId) {
  const { data, error } = await db
    .from('members')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });

  groupMembers = (error ? [] : data) || [];
}

document.getElementById('backToGroupsBtn').addEventListener('click', () => {
  hide('groupDetailView'); show('groupsView');
  loadGroups();
});

// ── Tabs ──────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn =>
  btn.addEventListener('click', () => switchTab(btn.dataset.tab))
);

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => {
    const isActive = p.id === `tab-${tab}`;
    if (isActive) {
      p.classList.remove('hidden');
      p.classList.add('tab-enter');
      p.addEventListener('animationend', () => p.classList.remove('tab-enter'), { once: true });
    } else {
      p.classList.add('hidden');
    }
  });

  if (tab === 'members')      renderMembers();
  if (tab === 'availability') renderHeatmap();
  if (tab === 'recommend')    renderRecommended();
}

// ── Members tab ───────────────────────────────────────────
function activityDot(dateStr) {
  if (!dateStr) return '<span class="activity-dot red" title="No activity"></span>';
  const days = (Date.now() - new Date(dateStr)) / 86400000;
  if (days < 7)  return '<span class="activity-dot green" title="Updated recently"></span>';
  if (days < 30) return '<span class="activity-dot yellow" title="Updated a while ago"></span>';
  return '<span class="activity-dot red" title="Updated a long time ago"></span>';
}

// Returns the username part of an email (before the @)
function emailUsername(email) {
  return email.includes('@') ? email.split('@')[0].toLowerCase() : null;
}

// localStorage helpers for manually dismissed pending entries (per group)
function getDismissed(groupId) {
  try { return JSON.parse(localStorage.getItem(`claire_dismissed_${groupId}`) || '[]'); } catch { return []; }
}
function addDismissed(groupId, entry) {
  const list = getDismissed(groupId);
  if (!list.includes(entry)) list.push(entry);
  localStorage.setItem(`claire_dismissed_${groupId}`, JSON.stringify(list));
}

function dismissPending(entry) {
  addDismissed(currentGroup.id, entry);
  renderMembers();
  showToast('Removed from waiting list.', 'success');
}

// Parses "Name <email>", plain email, or plain name
function parseExpectedEntry(e) {
  const match = e.match(/^(.+?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].trim(), email: match[2].trim().toLowerCase() };
  if (e.includes('@')) return { name: '', email: e.trim().toLowerCase() };
  return { name: e.trim(), email: '' };
}

// Looks up a name for a plain email in the contacts cache
function nameFromContacts(email) {
  if (!email || !contactGroups.length) return '';
  const lower = email.toLowerCase();
  for (const cg of contactGroups) {
    for (const m of (cg.members || [])) {
      if (m.email && m.email.toLowerCase() === lower) return m.name;
    }
  }
  return '';
}

function renderPending() {
  const expected = currentGroup?.expected_members || [];
  if (!expected.length) { hide('pendingSection'); return; }

  const respondedEmails    = new Set(groupMembers.map(m => m.email.toLowerCase()));
  const respondedUsernames = new Set(
    groupMembers.map(m => emailUsername(m.email)).filter(Boolean)
  );
  const respondedNames = new Set(groupMembers.map(m => m.name.toLowerCase()));
  const dismissed      = getDismissed(currentGroup.id);

  const pending = expected.filter(e => {
    if (dismissed.includes(e)) return false;
    const { name, email } = parseExpectedEntry(e);

    if (email) {
      if (respondedEmails.has(email)) return false;
      const uname = emailUsername(email);
      if (uname && respondedUsernames.has(uname)) return false;
    }
    if (name) {
      const lower = name.toLowerCase();
      if (Array.from(respondedNames).some(n => n.includes(lower) || lower.includes(n))) return false;
    }
    // Only mark as responded if we matched something
    if (!email && !name) return false;
    return true;
  });

  if (!pending.length) { hide('pendingSection'); return; }

  show('pendingSection');
  document.getElementById('pendingCount').textContent = `${pending.length} pending`;
  document.getElementById('pendingList').innerHTML = pending.map(p => {
    const parsed = parseExpectedEntry(p);
    const name  = parsed.name  || nameFromContacts(parsed.email);
    const email = parsed.email;
    return `
    <div class="pending-item">
      <span class="activity-dot red"></span>
      <div style="flex:1;min-width:0;">
        ${name  ? `<div style="font-weight:600;font-size:0.875rem;">${escHtml(name)}</div>`  : ''}
        ${email ? `<div style="font-size:0.78rem;color:var(--text-muted);">${escHtml(email)}</div>` : ''}
        ${!name && !email ? `<div>${escHtml(p)}</div>` : ''}
      </div>
      <button class="btn-icon btn-danger" title="Remove from waiting list"
        onclick="dismissPending(${JSON.stringify(p)})">✕</button>
    </div>`;
  }).join('');
}

function renderMembers() {
  const list  = document.getElementById('membersList');
  const empty = document.getElementById('membersEmpty');

  renderPending();

  if (!groupMembers.length) { list.innerHTML = ''; show('membersEmpty'); return; }
  hide('membersEmpty');

  const sorted = [...groupMembers].sort((a, b) =>
    new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
  );

  list.innerHTML = sorted.map(m => `
    <div class="member-item member-slide-in">
      <div style="display:flex;align-items:center;gap:0.5rem;">
        ${activityDot(m.updated_at || m.created_at)}
        <div>
          <div class="member-name">${escHtml(m.name)}</div>
          <div class="member-email">${escHtml(m.email)}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <span class="member-submitted" style="font-size:0.78rem;color:var(--text-muted);">Updated ${relativeTime(m.updated_at || m.created_at)}</span>
        <button class="btn-icon btn-danger" title="Remove member"
          onclick="removeMember('${m.id}','${escHtml(m.name)}')">✕</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('.member-slide-in').forEach((el, i) => {
    el.style.animationDelay = `${i * 55}ms`;
  });
}

async function removeMember(memberId, name) {
  if (!confirm(`Remove ${name} from this group?`)) return;
  const { error } = await db.from('members').delete().eq('id', memberId);
  if (error) { showToast('Failed to remove member.', 'error'); return; }
  groupMembers = groupMembers.filter(m => m.id !== memberId);
  renderMembers();
  showToast(`${name} removed.`, 'success');
}

// ── Availability heatmap ──────────────────────────────────
function renderHeatmap() {
  const grid  = document.getElementById('heatmapGrid');
  const empty = document.getElementById('heatmapEmpty');

  if (!groupMembers.length) { grid.innerHTML = ''; show('heatmapEmpty'); return; }
  hide('heatmapEmpty');

  const isSpecific = currentGroup?.schedule_mode === 'specific_dates';

  if (isSpecific) {
    _renderSpecificDatesHeatmap(grid);
  } else {
    _renderWeeklyHeatmap(grid);
  }

  // Legend (same for both modes)
  document.getElementById('heatmapLegend').innerHTML = `
    <div class="heatmap-legend-swatch" style="background:#F3F4F6"></div> None &nbsp;
    <div class="heatmap-legend-swatch" style="background:#FCD34D"></div> Some &nbsp;
    <div class="heatmap-legend-swatch" style="background:#F59E0B"></div> Most &nbsp;
    <div class="heatmap-legend-swatch" style="background:#22C55E"></div> All available`;
}

function _renderWeeklyHeatmap(grid) {
  grid.style.gridTemplateColumns = ''; // reset any specific-dates override
  const tzMembers = getMembersInAdminTz();
  const total  = tzMembers.length;
  const matrix = Array.from({ length: 7 }, () => new Array(TOTAL_SLOTS).fill(0));
  for (const m of tzMembers) {
    const avail = m.availability || {};
    for (let d = 0; d < 7; d++) {
      for (const s of (avail[d] || [])) { if (s < TOTAL_SLOTS) matrix[d][s]++; }
    }
  }

  let html = '<div></div>'; // corner
  for (const d of DAYS_SHORT) html += `<div class="heatmap-day-label">${d}</div>`;

  for (let s = 0; s < TOTAL_SLOTS; s++) {
    const label = s % 2 === 0 ? slotToTime(s) : '';
    html += `<div class="heatmap-time-label">${label}</div>`;
    for (let d = 0; d < 7; d++) {
      const count = matrix[d][s];
      const intensity = count / total;
      const bg = heatColor(intensity);
      const tip = `${DAYS[d]} ${slotToTime(s)}: ${count}/${total} available`;
      html += `<div class="heatmap-cell" style="background:${bg}" title="${tip}"
        data-day="${d}" data-slot="${s}" onclick="showSlotDetail(${d},${s})"></div>`;
    }
  }

  grid.innerHTML = html;

  grid.querySelectorAll('.heatmap-cell').forEach(el => {
    const day = +el.dataset.day;
    el.style.animationDelay = `${day * 55}ms`;
    el.classList.add('heatmap-col-fadein');
    el.addEventListener('animationend', () => el.classList.remove('heatmap-col-fadein'), { once: true });
  });
}

function _renderSpecificDatesHeatmap(grid) {
  const dates = [...(currentGroup.date_window || [])].sort();
  if (!dates.length) {
    grid.innerHTML = '<p class="text-muted" style="padding:1rem;grid-column:1/-1;">No specific dates configured. Edit the schedule to add dates.</p>';
    return;
  }

  const tzMembers = getMembersInAdminTz();
  const total = tzMembers.length;

  // Build matrix: matrix[dateIndex][slot]
  const matrix = dates.map(() => new Array(TOTAL_SLOTS).fill(0));
  for (const m of tzMembers) {
    const avail = m.availability || {};
    dates.forEach((iso, di) => {
      for (const s of (avail[iso] || [])) { if (s < TOTAL_SLOTS) matrix[di][s]++; }
    });
  }

  // Override grid columns for N dates
  grid.style.gridTemplateColumns = `3.5rem repeat(${dates.length}, 1fr)`;

  const dateHeaders = dates.map((iso, di) => {
    const d = new Date(iso + 'T00:00:00');
    const label = d.toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' });
    return `<div class="heatmap-day-label" style="font-size:0.68rem;white-space:normal;text-align:center;line-height:1.2;">${label}</div>`;
  }).join('');

  let html = '<div></div>' + dateHeaders;

  for (let s = 0; s < TOTAL_SLOTS; s++) {
    const label = s % 2 === 0 ? slotToTime(s) : '';
    html += `<div class="heatmap-time-label">${label}</div>`;
    dates.forEach((iso, di) => {
      const count = matrix[di][s];
      const intensity = count / total;
      const bg = heatColor(intensity);
      const d = new Date(iso + 'T00:00:00');
      const dateLabel = d.toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' });
      const tip = `${dateLabel} ${slotToTime(s)}: ${count}/${total} available`;
      html += `<div class="heatmap-cell" style="background:${bg}" title="${tip}"
        data-dateiso="${iso}" data-slot="${s}" onclick="showSlotDetailDate('${iso}',${s})"></div>`;
    });
  }

  grid.innerHTML = html;

  grid.querySelectorAll('.heatmap-cell').forEach((el, i) => {
    const col = i % dates.length;
    el.style.animationDelay = `${col * 55}ms`;
    el.classList.add('heatmap-col-fadein');
    el.addEventListener('animationend', () => el.classList.remove('heatmap-col-fadein'), { once: true });
  });
}

// ── Slot detail popup ─────────────────────────────────────
let slotDetailDay = 0, slotDetailSlot = 0;

function showSlotDetail(day, slot) {
  slotDetailDay  = day;
  slotDetailSlot = slot;

  const tzMembers = getMembersInAdminTz();
  const available   = tzMembers.filter(m => (m.availability?.[day] || []).includes(slot));
  const unavailable = tzMembers.filter(m => !(m.availability?.[day] || []).includes(slot));
  const adminTz     = getAdminTimezone();
  const tzLabel     = adminTz.split('/').pop().replace(/_/g, ' ');

  document.getElementById('slotDetailTitle').textContent =
    `${DAYS[day]} at ${slotToTime(slot)}`;

  document.getElementById('slotDetailContent').innerHTML = `
    <p class="text-muted" style="font-size:0.8rem;margin-bottom:1rem;">Times shown in ${tzLabel}</p>
    <div style="margin-bottom:1rem;">
      <div style="font-weight:600;color:var(--success);margin-bottom:0.4rem;">
        <span class="icon-emoji">✅</span> Free (${available.length})
      </div>
      ${available.length
        ? available.map(m => `<div class="slot-detail-name">${escHtml(m.name)}</div>`).join('')
        : '<p class="text-muted" style="font-size:0.85rem;">Nobody is free</p>'}
    </div>
    <div>
      <div style="font-weight:600;color:var(--danger);margin-bottom:0.4rem;">
        <span class="icon-emoji">❌</span> Busy (${unavailable.length})
      </div>
      ${unavailable.length
        ? unavailable.map(m => `<div class="slot-detail-name">${escHtml(m.name)}</div>`).join('')
        : '<p class="text-muted" style="font-size:0.85rem;">Nobody is busy</p>'}
    </div>`;

  document.getElementById('slotDetailModal').classList.remove('hidden');
  document.getElementById('scheduleFromSlotBtn').style.display = '';
}

function closeSlotDetail() {
  document.getElementById('slotDetailModal').classList.add('hidden');
}

// Slot detail for specific-dates mode
function showSlotDetailDate(iso, slot) {
  const tzMembers = getMembersInAdminTz();
  const available   = tzMembers.filter(m => (m.availability?.[iso] || []).includes(slot));
  const unavailable = tzMembers.filter(m => !(m.availability?.[iso] || []).includes(slot));
  const adminTz     = getAdminTimezone();
  const tzLabel     = adminTz.split('/').pop().replace(/_/g, ' ');
  const d = new Date(iso + 'T00:00:00');
  const dateLabel = d.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  document.getElementById('slotDetailTitle').textContent = `${dateLabel} at ${slotToTime(slot)}`;

  document.getElementById('slotDetailContent').innerHTML = `
    <p class="text-muted" style="font-size:0.8rem;margin-bottom:1rem;">Times shown in ${tzLabel}</p>
    <div style="margin-bottom:1rem;">
      <div style="font-weight:600;color:var(--success);margin-bottom:0.4rem;">
        <span class="icon-emoji">✅</span> Free (${available.length})
      </div>
      ${available.length
        ? available.map(m => `<div class="slot-detail-name">${escHtml(m.name)}</div>`).join('')
        : '<p class="text-muted" style="font-size:0.85rem;">Nobody is free</p>'}
    </div>
    <div>
      <div style="font-weight:600;color:var(--danger);margin-bottom:0.4rem;">
        <span class="icon-emoji">❌</span> Busy (${unavailable.length})
      </div>
      ${unavailable.length
        ? unavailable.map(m => `<div class="slot-detail-name">${escHtml(m.name)}</div>`).join('')
        : '<p class="text-muted" style="font-size:0.85rem;">Nobody is busy</p>'}
    </div>`;

  document.getElementById('slotDetailModal').classList.remove('hidden');
  // Hide "schedule from this slot" for specific dates (no recurring meeting logic)
  document.getElementById('scheduleFromSlotBtn').style.display = 'none';
}

document.getElementById('closeSlotDetailModal').addEventListener('click', closeSlotDetail);
document.getElementById('closeSlotDetailBtn').addEventListener('click', closeSlotDetail);

document.getElementById('scheduleFromSlotBtn').addEventListener('click', () => {
  closeSlotDetail();
  scheduleFromHeatmapSlot(slotDetailDay, slotDetailSlot);
});

// ── Recommended times tab ─────────────────────────────────
function renderRecommended() {
  const container = document.getElementById('recTimesGrid');
  const empty     = document.getElementById('recEmpty');

  if (!groupMembers.length) { container.innerHTML = ''; show('recEmpty'); return; }

  // Specific dates mode: show best slots per date instead of recurring recommendations
  if (currentGroup?.schedule_mode === 'specific_dates') {
    _renderSpecificDatesRecommended(container, empty);
    return;
  }

  const recs = getRecommendedTimes(getMembersInAdminTz());
  if (!recs.length) { container.innerHTML = ''; show('recEmpty'); return; }
  hide('recEmpty');

  container.innerHTML = recs.map((r, i) => `
    <div class="rec-time-card ${r.allAvailable ? 'all-available' : ''}">
      <div class="rec-time-day">${DAYS[r.day]}</div>
      <div class="rec-time-range">${slotRangeLabel(r.startSlot, r.endSlot)}</div>
      <div class="rec-time-count ${r.allAvailable ? 'full' : 'partial'}">
        ${r.allAvailable ? '🎉 Everyone free!' : `${r.count} / ${r.total} available (${r.percentage || Math.round(r.count/r.total*100)}%)`}
      </div>
      <button class="btn btn-sm btn-secondary" style="margin-top:0.6rem;width:100%;"
        onclick='prefillSchedule(${JSON.stringify(r)})'>Schedule This →</button>
    </div>`).join('');
}

function _renderSpecificDatesRecommended(container, empty) {
  const dates = [...(currentGroup.date_window || [])].sort();
  if (!dates.length) { container.innerHTML = ''; show('recEmpty'); return; }

  const tzMembers = getMembersInAdminTz();
  const total = tzMembers.length;

  // For each date, find the best slot block (longest run with most people free)
  const recs = [];
  for (const iso of dates) {
    // Count availability per slot
    const counts = new Array(TOTAL_SLOTS).fill(0);
    for (const m of tzMembers) {
      for (const s of (m.availability?.[iso] || [])) { if (s < TOTAL_SLOTS) counts[s]++; }
    }
    // Find best contiguous block (2+ slots = 1 hr min) with max attendees
    let best = null;
    for (let s = 0; s < TOTAL_SLOTS - 1; s++) {
      if (counts[s] === 0) continue;
      let end = s;
      while (end + 1 < TOTAL_SLOTS && counts[end + 1] === counts[s]) end++;
      const score = counts[s] * (end - s + 1);
      if (!best || score > best.score) {
        best = { startSlot: s, endSlot: end, count: counts[s], score };
      }
      s = end;
    }
    if (best && best.count > 0) {
      const d = new Date(iso + 'T00:00:00');
      recs.push({ iso, dateLabel: d.toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' }), ...best, total, allAvailable: best.count === total });
    }
  }

  if (!recs.length) { container.innerHTML = ''; show('recEmpty'); return; }
  hide('recEmpty');

  container.innerHTML = recs.map(r => `
    <div class="rec-time-card ${r.allAvailable ? 'all-available' : ''}">
      <div class="rec-time-day">${r.dateLabel}</div>
      <div class="rec-time-range">${slotRangeLabel(r.startSlot, r.endSlot)}</div>
      <div class="rec-time-count ${r.allAvailable ? 'full' : 'partial'}">
        ${r.allAvailable ? '🎉 Everyone free!' : `${r.count} / ${r.total} available (${Math.round(r.count/r.total*100)}%)`}
      </div>
    </div>`).join('');
}

// ── Main view switcher (Schedules / Contacts / Tasks) ─────
function switchMainView(view) {
  ['schedules','contacts','tasks'].forEach(v => {
    document.getElementById(v + 'Section').classList.toggle('hidden', v !== view);
    document.getElementById('nav' + v.charAt(0).toUpperCase() + v.slice(1)).classList.toggle('active', v === view);
  });
  if (view === 'contacts') loadContactGroups();
  if (view === 'tasks') loadTasks();
  try { localStorage.setItem('claire_admin_view', view); } catch {}
}

// ══════════════════════════════════════════════════════════
//  TASKS SYSTEM
// ══════════════════════════════════════════════════════════

let allTasks = [], allTaskLists = [], editingTaskId = null;

// ── Deadline urgency ──────────────────────────────────────
// Always parse deadline as local midnight to avoid UTC off-by-one
function safeDate(d) {
  if (!d) return null;
  return new Date(String(d).slice(0, 10) + 'T00:00:00');
}

function deadlineClass(deadline, time) {
  if (!deadline) return '';
  const dt = safeDate(deadline);
  if (!dt) return '';
  const now = new Date();
  if (time) {
    const [h, m] = time.split(':').map(Number);
    const fullDt = new Date(dt);
    fullDt.setHours(h, m, 0, 0);
    const diffMs = fullDt - now;
    if (diffMs < 0) return 'deadline-overdue';
    const diffDays = diffMs / 86400000;
    if (diffDays < 1)  return 'deadline-today';
    if (diffDays < 3)  return 'deadline-soon';
    if (diffDays < 7)  return 'deadline-week';
    if (diffDays < 14) return 'deadline-2wk';
    if (diffDays < 30) return 'deadline-month';
    return 'deadline-far';
  }
  const days = (dt - now) / 86400000;
  if (days < 0)   return 'deadline-overdue';
  if (days < 1)   return 'deadline-today';
  if (days < 3)   return 'deadline-soon';
  if (days < 7)   return 'deadline-week';
  if (days < 14)  return 'deadline-2wk';
  if (days < 30)  return 'deadline-month';
  return 'deadline-far';
}

function deadlineLabel(deadline, time) {
  const dt = safeDate(deadline);
  if (!dt) return '';
  const days = Math.ceil((dt - new Date()) / 86400000);
  const timeSuffix = time ? ` ${_fmt12h(time)}` : '';
  if (days < 0)   return `Overdue by ${Math.abs(days)}d${timeSuffix}`;
  if (days === 0) return `Due today${timeSuffix}`;
  if (days === 1) return `Due tomorrow${timeSuffix}`;
  return `Due in ${days}d${timeSuffix}`;
}

// ── Share link ────────────────────────────────────────────
function copyTasksLink() {
  const url = `${location.origin}/tasks`;
  navigator.clipboard.writeText(url)
    .then(() => showToast('Link copied!', 'success'))
    .catch(() => showToast('Could not copy.', 'error'));
}

// ── Load tasks + lists ────────────────────────────────────
async function loadTasks() {
  show('tasksLoading'); hide('tasksBody'); hide('tasksEmpty');
  const shareUrl = document.getElementById('taskShareUrl');
  if (shareUrl) shareUrl.textContent = `${location.origin}/tasks`;

  const [tasksRes, listsRes] = await Promise.all([
    fetch(`/api/tasks?adminCode=${encodeURIComponent(getAdminCode())}`),
    fetch(`/api/task-lists?adminCode=${encodeURIComponent(getAdminCode())}`),
  ]);

  hide('tasksLoading');

  if (!tasksRes.ok || !listsRes.ok) {
    showToast('Failed to load tasks.', 'error'); return;
  }

  allTasks = await tasksRes.json();
  allTaskLists = await listsRes.json();

  const privateTasks = allTasks.filter(t => t.is_private);

  renderPrivateTasks(privateTasks);
  applyTaskFilters();

  // Update nav badge with active task count
  const activeCount = allTasks.filter(t => !t.is_private && t.status !== 'complete').length;
  const navBtn = document.getElementById('navTasks');
  if (navBtn) {
    let badge = navBtn.querySelector('.nav-badge');
    if (activeCount > 0) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'nav-badge'; navBtn.appendChild(badge); }
      badge.textContent = activeCount;
    } else if (badge) {
      badge.remove();
    }
  }
  if (allTasks.filter(t => !t.is_private).length && taskViewMode === 'list') show('tasksBody');
  refreshFocusPicker();
  setDensity(taskDensity);
  updateOverdueBanner();
}

// ── Private tasks ─────────────────────────────────────────
function renderPrivateTasks(tasks) {
  const el = document.getElementById('privateTasksList');
  if (!tasks.length) {
    el.innerHTML = '<span class="text-muted text-sm">No private tasks yet.</span>';
    return;
  }
  el.innerHTML = tasks.map(t => `
    <div class="private-task-row ${deadlineClass(t.deadline, t.deadline_time)}">
      <label class="private-task-check">
        <input type="checkbox" ${t.status === 'complete' ? 'checked' : ''}
          onchange="togglePrivateTaskStatus('${t.id}', this.checked)" />
        <span class="private-task-title ${t.status === 'complete' ? 'task-done' : ''}">${escHtml(t.title)}</span>
      </label>
      ${t.deadline ? `<span class="task-deadline-pill ${deadlineClass(t.deadline, t.deadline_time)}">${deadlineLabel(t.deadline, t.deadline_time)}</span>` : ''}
      <button class="btn-icon text-danger" onclick="deleteTask('${t.id}')" title="Delete">✕</button>
    </div>`).join('');
}

async function togglePrivateTaskStatus(id, done) {
  if (done) launchConfetti();
  await fetch('/api/tasks', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status: done ? 'complete' : 'todo', adminCode: getAdminCode() }),
  });
  loadTasks();
}

function savePrivateTask() {
  const title = document.getElementById('privateTaskTitle').value.trim();
  if (!title) return;
  cancelPrivateTask();
  fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, is_private: true, adminCode: getAdminCode() }),
  }).then(() => loadTasks());
}

function cancelPrivateTask() {
  document.getElementById('privateTaskInput').classList.add('hidden');
  document.getElementById('privateTaskTitle').value = '';
}

// ── Shared tasks ──────────────────────────────────────────
// ── Filter / search state ─────────────────────────────────
let taskStatusFilter = 'all';
let collapsedLists   = (() => { try { return new Set(JSON.parse(localStorage.getItem('claire_collapsed_lists') || '[]')); } catch { return new Set(); } })();
function _saveCollapsedLists() { try { localStorage.setItem('claire_collapsed_lists', JSON.stringify([...collapsedLists])); } catch {} }
let focusAssignee    = '';
let taskDensity      = (() => { try { return localStorage.getItem('claire_task_density') || 'comfortable'; } catch { return 'comfortable'; } })();

// ── Comment notification tracking ────────────────────────
function getSeenComments() {
  try { return JSON.parse(localStorage.getItem('claire_seen_comments') || '{}'); } catch { return {}; }
}
function markTaskSeen(taskId) {
  const seen = getSeenComments();
  seen[taskId] = Date.now();
  try { localStorage.setItem('claire_seen_comments', JSON.stringify(seen)); } catch {}
}
function hasNewComments(t) {
  const comments = t.task_comments;
  if (!comments || !comments.length) return false;
  const seen = getSeenComments();
  const lastSeen = seen[t.id];
  if (!lastSeen) return true;
  return comments.some(c => new Date(c.created_at).getTime() > lastSeen);
}
function commentBadgeHtml(t) {
  if (!hasNewComments(t)) return '';
  return `<span class="task-comment-badge" title="New comments"></span>`;
}

function setTaskStatusFilter(btn) {
  document.querySelectorAll('#taskFilterChips .filter-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  taskStatusFilter = btn.dataset.status;
  applyTaskFilters();
}

function onSortChange() {
  const sortMode = document.getElementById('taskSortSelect')?.value || 'default';
  const wrap     = document.getElementById('taskFlatToggleWrap');
  const checkbox = document.getElementById('taskFlatToggle');
  if (wrap) {
    const isDueSort = sortMode !== 'default';
    wrap.classList.toggle('hidden', !isDueSort);
    wrap.style.display = isDueSort ? 'flex' : 'none';
    if (isDueSort && checkbox) checkbox.checked = true;   // auto flat on due-date sort
    if (!isDueSort && checkbox) checkbox.checked = false; // reset when back to default
  }
  applyTaskFilters();
}

function applyTaskFilters() {
  // Delegate to the right view renderer if not in list mode
  if (taskViewMode === 'calendar') { renderCalendar(); updateOverdueBanner(); return; }

  const q = (document.getElementById('taskSearchInput')?.value || '').toLowerCase().trim();
  const shared = allTasks.filter(t => !t.is_private);

  let filtered = shared.filter(t => {
    // Status filter — 'overdue' is a special value
    if (taskStatusFilter === 'overdue') {
      if (deadlineClass(t.deadline, t.deadline_time) !== 'deadline-overdue' || t.status === 'complete') return false;
    } else if (taskStatusFilter !== 'all' && t.status !== taskStatusFilter) {
      return false;
    }
    if (!q) return true;
    const inTitle    = t.title.toLowerCase().includes(q);
    const inList     = (t.todo_lists?.name || '').toLowerCase().includes(q);
    const inAssignee = (t.task_assignments || []).some(a =>
      (a.assignee_name || '').toLowerCase().includes(q) ||
      (a.assignee_email || '').toLowerCase().includes(q)
    );
    return inTitle || inList || inAssignee;
  });

  // Focus assignee filter
  if (focusAssignee) {
    filtered = filtered.filter(t => (t.task_assignments || []).some(a => a.assignee_email === focusAssignee));
  }

  hide('tasksEmpty');
  const noResults = document.getElementById('tasksNoResults');

  if (!filtered.length && shared.length) {
    hide('tasksBody');
    noResults?.classList.remove('hidden');
    updateOverdueBanner();
    return;
  }
  noResults?.classList.add('hidden');
  renderSharedTasks(filtered);
  show('tasksBody');
  updateOverdueBanner();
}

// ── View state ─────────────────────────────────────────────
let taskViewMode  = 'list';   // 'list' | 'calendar'
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-based
let calHeatmapOn = false;

function setTaskView(mode) {
  taskViewMode = mode;
  ['list','cal'].forEach(v => {
    const btnId = 'view' + v.charAt(0).toUpperCase() + v.slice(1) + 'Btn';
    const modeKey = v === 'cal' ? 'calendar' : v;
    document.getElementById(btnId)?.classList.toggle('active', mode === modeKey);
  });

  hide('tasksCalendarView');
  hide('tasksBody');
  hide('tasksNoResults');

  if (mode === 'list') {
    applyTaskFilters();
  } else if (mode === 'calendar') {
    show('tasksCalendarView');
    renderCalendar();
  }

  try { localStorage.setItem('claire_admin_view', 'tasks'); } catch {}
}

function calShiftMonth(delta) {
  calMonth += delta;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  renderCalendar();
}

// ── Heatmap toggle ─────────────────────────────────────────
function toggleCalHeatmap() {
  calHeatmapOn = !calHeatmapOn;
  const btn = document.getElementById('calHeatmapBtn');
  if (btn) btn.textContent = calHeatmapOn ? 'Heatmap: On' : 'Heatmap: Off';
  renderCalendar();
}

// ── Density toggle ─────────────────────────────────────────
function setDensity(d) {
  taskDensity = d;
  try { localStorage.setItem('claire_task_density', d); } catch {}
  document.querySelectorAll('.density-btn').forEach(b => b.classList.toggle('active', b.dataset.density === d));
  const body = document.getElementById('tasksBody');
  if (body) { body.classList.remove('density-compact', 'density-comfortable', 'density-detailed'); body.classList.add('density-' + d); }
}

// ── Focus (assignee filter) ────────────────────────────────
function setFocusAssignee(name, email) {
  focusAssignee = email;
  const input   = document.getElementById('focusSearchInput');
  const clearBtn = document.getElementById('focusClearBtn');
  const dropdown = document.getElementById('focusDropdown');
  if (input)   { input.value = name || ''; input.placeholder = email ? '' : 'Focus: all people…'; }
  if (clearBtn) clearBtn.classList.toggle('hidden', !email);
  if (dropdown) dropdown.classList.add('hidden');
  if (taskViewMode === 'calendar') renderCalendar();
  else applyTaskFilters();
}

function clearFocus() {
  setFocusAssignee('', '');
  const input = document.getElementById('focusSearchInput');
  if (input) { input.value = ''; input.placeholder = 'Focus: all people…'; }
}

let focusSearchTimer = null;
function onFocusSearch(q) {
  clearTimeout(focusSearchTimer);
  focusSearchTimer = setTimeout(() => renderFocusDropdown(q.trim().toLowerCase()), 150);
}

function showFocusDropdown() {
  const q = (document.getElementById('focusSearchInput')?.value || '').trim().toLowerCase();
  renderFocusDropdown(q);
}

function renderFocusDropdown(q) {
  const dropdown = document.getElementById('focusDropdown');
  if (!dropdown) return;

  // Build people list from tasks + contacts
  const seen = new Set();
  const people = [];
  allTasks.filter(t => !t.is_private).forEach(t => {
    (t.task_assignments || []).forEach(a => {
      if (!seen.has(a.assignee_email)) {
        seen.add(a.assignee_email);
        people.push({ name: a.assignee_name || a.assignee_email, email: a.assignee_email });
      }
    });
  });
  // Also search contacts API if query is long enough
  if (q.length >= 2) {
    fetch(`/api/contacts-search?name=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(results => {
        results.forEach(c => {
          if (!seen.has(c.email)) {
            seen.add(c.email);
            people.push({ name: c.name, email: c.email });
          }
        });
        _renderFocusResults(dropdown, people, q);
      }).catch(() => _renderFocusResults(dropdown, people, q));
    return;
  }
  _renderFocusResults(dropdown, people, q);
}

function _renderFocusResults(dropdown, people, q) {
  const filtered = q
    ? people.filter(p => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
    : people;
  filtered.sort((a, b) => a.name.localeCompare(b.name));

  if (!filtered.length) { dropdown.classList.add('hidden'); return; }

  dropdown.innerHTML = filtered.slice(0, 10).map(p => `
    <div class="focus-dropdown-item" onmousedown="event.preventDefault();setFocusAssignee('${escHtml(p.name)}','${escHtml(p.email)}')">
      <div class="task-chip-avatar" style="width:1.6rem;height:1.6rem;font-size:0.7rem;flex-shrink:0;">${p.name[0].toUpperCase()}</div>
      <div>
        <div style="font-size:0.85rem;font-weight:600;">${escHtml(p.name)}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);">${escHtml(p.email)}</div>
      </div>
    </div>`).join('');
  dropdown.classList.remove('hidden');
}

function refreshFocusPicker() {
  // No-op — focus picker is now a live search input, nothing to pre-populate
}

// Hide dropdown when clicking elsewhere
document.addEventListener('click', e => {
  if (!e.target.closest('#focusPickerWrap')) {
    document.getElementById('focusDropdown')?.classList.add('hidden');
  }
});

// ── Overdue banner ─────────────────────────────────────────
function updateOverdueBanner() {
  const banner  = document.getElementById('overdueBanner');
  const textEl  = document.getElementById('overdueBannerText');
  if (!banner || !textEl) return;
  const count = allTasks.filter(t =>
    !t.is_private && t.status !== 'complete' && deadlineClass(t.deadline, t.deadline_time) === 'deadline-overdue'
  ).length;
  if (count > 0) {
    textEl.textContent = `${count} task${count > 1 ? 's' : ''} overdue`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

function filterToOverdue() {
  // Set status filter chip to 'overdue' (special value)
  taskStatusFilter = 'overdue';
  document.querySelectorAll('#taskFilterChips .filter-chip').forEach(c => c.classList.remove('active'));
  if (taskViewMode !== 'list') setTaskView('list');
  else applyTaskFilters();
}

// ── Timeline / Gantt strip ─────────────────────────────────

function renderCalendar() {
  const shared = allTasks.filter(t => !t.is_private);
  const focused = focusAssignee
    ? shared.filter(t => (t.task_assignments || []).some(a => a.assignee_email === focusAssignee))
    : shared;
  const today  = new Date(); today.setHours(0,0,0,0);

  // Bucket tasks by YYYY-MM-DD string
  const byDay = {};
  const noDeadline = [];
  focused.forEach(t => {
    if (!t.deadline) { noDeadline.push(t); return; }
    const key = String(t.deadline).slice(0, 10);
    (byDay[key] = byDay[key] || []).push(t);
  });

  // Heatmap: compute max tasks per day in this month
  let maxTasks = 0;
  if (calHeatmapOn) {
    Object.values(byDay).forEach(arr => { if (arr.length > maxTasks) maxTasks = arr.length; });
  }

  // Label
  const label = new Date(calYear, calMonth, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  document.getElementById('calMonthLabel').textContent = label;

  // Build grid
  const firstDow = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let html = DAYS.map(d => `<div class="cal-day-header">${d}</div>`).join('');

  // Empty leading cells
  for (let i = 0; i < firstDow; i++) html += '<div class="cal-cell cal-cell-empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const key  = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dt   = new Date(calYear, calMonth, d);
    const isToday = dt.getTime() === today.getTime();
    const tasks = byDay[key] || [];

    const dots = tasks.map(t => {
      const sc = STATUS_COLORS[t.status] || '';
      return `<div class="cal-task-dot ${sc} ${deadlineClass(t.deadline, t.deadline_time)}" onclick="openTaskDetail('${t.id}')" title="${escHtml(t.title)}">${escHtml(t.title)}</div>`;
    }).join('');

    let heatStyle = '';
    if (calHeatmapOn && maxTasks > 0 && tasks.length > 0) {
      const intensity = tasks.length / maxTasks;
      const alpha = Math.round(intensity * 0.35 * 100) / 100;
      heatStyle = ` style="background:rgba(234,179,8,${alpha});"`;
    }

    html += `
      <div class="cal-cell ${isToday ? 'cal-cell-today' : ''} ${tasks.length ? 'cal-cell-has-tasks' : ''}"${heatStyle}>
        <div class="cal-day-num ${isToday ? 'cal-today-badge' : ''}">${d}</div>
        ${dots}
      </div>`;
  }

  document.getElementById('calGrid').innerHTML = html;

  // No-deadline list
  const ndEl   = document.getElementById('calNoDeadline');
  const ndList = document.getElementById('calNoDeadlineList');
  if (noDeadline.length) {
    ndList.innerHTML = noDeadline.map(t => taskCardHtml(t)).join('');
    ndEl.classList.remove('hidden');
  } else {
    ndEl.classList.add('hidden');
  }
}

function renderSharedTasks(tasks) {
  const body       = document.getElementById('tasksBody');
  const sortMode   = document.getElementById('taskSortSelect')?.value || 'default';
  const flatMode   = sortMode !== 'default' && document.getElementById('taskFlatToggle')?.checked;
  const statusOrder = { in_progress: 0, todo: 1, complete: 2 };

  function dueSortFn(a, b) {
    const da = a.deadline ? safeDate(a.deadline).getTime() : Infinity;
    const db = b.deadline ? safeDate(b.deadline).getTime() : Infinity;
    return sortMode === 'due_desc' ? db - da : da - db;
  }

  // ── FLAT VIEW (sorted by due date, no group headers) ──
  if (flatMode) {
    const sorted = [...tasks].sort(dueSortFn);
    const active = sorted.filter(t => t.status !== 'complete');
    const done   = sorted.filter(t => t.status === 'complete');

    let html = `<div class="task-group" style="border-radius:12px;overflow:hidden;"><div class="task-list">`;
    html += active.map(t => taskCardHtml(t, true)).join('');
    if (done.length) {
      html += `<details class="task-done-group">
        <summary class="task-done-summary">${done.length} completed
          <button class="btn btn-danger-ghost btn-sm" style="margin-left:0.75rem;"
            onclick="event.stopPropagation();event.preventDefault();clearCompletedTasks(null)">Clear done</button>
        </summary>
        ${done.map(t => taskCardHtml(t, true)).join('')}
      </details>`;
    }
    html += `</div></div>`;
    body.innerHTML = tasks.length ? html : '<p class="text-muted text-sm" style="padding:1rem;">No tasks yet.</p>';
    return;
  }

  // ── GROUPED VIEW ──
  const groups = new Map();
  groups.set(null, []);
  allTaskLists.forEach(l => groups.set(l.id, []));
  tasks.forEach(t => {
    const key = t.list_id || null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });

  let html = '';
  groups.forEach((groupTasks, listId) => {
    if (!groupTasks.length) return;
    const listName  = listId ? (allTaskLists.find(l => l.id === listId)?.name || 'Unknown') : 'No Folder';
    const colKey    = listId || 'null';
    const collapsed = collapsedLists.has(colKey);
    const sorted = [...groupTasks].sort(
      sortMode === 'default'
        ? (a, b) => (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1)
        : dueSortFn
    );
    const active = sorted.filter(t => t.status !== 'complete');
    const done   = sorted.filter(t => t.status === 'complete');

    const total = active.length + done.length;
    const pct   = total > 0 ? Math.round(done.length / total * 100) : 0;
    const allDone = active.length === 0 && done.length > 0;
    const progressColorClass = pct >= 80 ? 'progress-fill-green' : pct >= 40 ? 'progress-fill-amber' : 'progress-fill-grey';

    html += `
      <div class="task-group ${collapsed ? 'task-group-collapsed' : ''} ${allDone ? 'task-group-complete' : ''}" data-list="${listId || ''}">
        <div class="task-group-header" onclick="toggleListCollapse('${colKey}')">
          <span class="task-group-chevron">${collapsed ? '›' : '⌄'}</span>
          <span class="task-group-name">${escHtml(listName)}${allDone ? ' <span style="color:#166534;font-size:0.85rem;">&#10003; All done!</span>' : ''}</span>
          <span class="task-group-count">${active.length} active${done.length ? ` · ${done.length} done` : ''}</span>
          <button class="btn btn-ghost btn-sm task-group-copy-btn"
            onclick="event.stopPropagation();copyListSummary('${listId || ''}')" title="Copy summary">Copy Summary</button>
          ${done.length ? `<button class="btn btn-danger-ghost btn-sm"
            onclick="event.stopPropagation();clearCompletedTasks('${listId || ''}')" title="Delete completed tasks in this folder">Clear done</button>` : ''}
          ${listId ? `<button class="btn-icon text-danger" onclick="event.stopPropagation();deleteList('${listId}')" title="Delete folder">✕</button>` : ''}
        </div>
        <div class="task-group-progress-bar"><div class="task-group-progress-fill ${progressColorClass}" style="width:${pct}%"></div></div>
        <div class="task-list">
          ${active.map(t => taskCardHtml(t)).join('')}
          ${done.length ? `
            <details class="task-done-group">
              <summary class="task-done-summary">${done.length} completed</summary>
              ${done.map(t => taskCardHtml(t)).join('')}
            </details>` : ''}
        </div>
      </div>`;
  });

  body.innerHTML = html || '<p class="text-muted text-sm" style="padding:1rem;">No tasks yet.</p>';
}

function toggleListCollapse(colKey) {
  if (collapsedLists.has(colKey)) {
    collapsedLists.delete(colKey);
  } else {
    collapsedLists.add(colKey);
  }
  _saveCollapsedLists();
  const selector = colKey === 'null' ? '[data-list=""]' : `[data-list="${colKey}"]`;
  document.querySelector(`.task-group${selector}`)?.classList.toggle('task-group-collapsed');
}

const STATUS_LABELS = { todo: 'To Do', in_progress: 'In Progress', complete: 'Complete' };
const STATUS_COLORS = { todo: '', in_progress: 'status-inprogress', complete: 'status-complete' };

function taskCardHtml(t, showListTag = false) {
  const assignments = t.task_assignments || [];
  const dClass      = deadlineClass(t.deadline, t.deadline_time);
  const isDetailed  = taskDensity === 'detailed';
  const listName    = (showListTag || isDetailed) && t.list_id
    ? (allTaskLists.find(l => l.id === t.list_id)?.name || null)
    : null;

  const descPreview = t.description
    ? `<div class="task-card-desc">${escHtml(t.description.slice(0, 180))}${t.description.length > 180 ? '\u2026' : ''}</div>`
    : '';

  // In detailed mode show full date; in comfortable just relative label
  const deadlinePill = t.deadline
    ? (() => {
        const fullDate = isDetailed
          ? safeDate(t.deadline).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
            + (t.deadline_time ? ` at ${_fmt12h(t.deadline_time)}` : '')
          : deadlineLabel(t.deadline, t.deadline_time);
        return `<span class="task-deadline-pill ${dClass} deadline-pill-always">${fullDate}</span>`;
      })()
    : '';

  const assigneeHtml = assignments.length
    ? assignments.map(a => {
        const label = isDetailed && a.assignee_email
          ? `${escHtml(a.assignee_name || '')}${a.assignee_name ? ' · ' : ''}<span style="font-size:0.72em;opacity:0.75;">${escHtml(a.assignee_email)}</span>`
          : escHtml(a.assignee_name || a.assignee_email);
        return `<span class="task-chip">${label}</span>`;
      }).join('')
    : '';

  return `
    <div class="task-card ${t.status === 'complete' ? 'task-card-done' : ''} ${dClass}" data-task-id="${t.id}"
         onclick="openTaskDetail('${t.id}')">
      <div class="task-card-left" onclick="event.stopPropagation()">
        <select class="task-status-dropdown ${STATUS_COLORS[t.status] || ''}"
                onclick="event.stopPropagation()"
                onchange="event.stopPropagation(); this.className='task-status-dropdown '+(STATUS_COLORS[this.value]||''); updateTaskStatus('${t.id}', this.value)">
          <option value="todo"        ${t.status==='todo'        ?'selected':''}>To Do</option>
          <option value="in_progress" ${t.status==='in_progress' ?'selected':''}>In Progress</option>
          <option value="complete"    ${t.status==='complete'    ?'selected':''}>Complete</option>
        </select>
      </div>
      <div class="task-card-body">
        <div class="task-card-title ${t.status === 'complete' ? 'task-done' : ''}">${escHtml(t.title)}${commentBadgeHtml(t)}</div>
        ${descPreview}
        <div class="task-card-meta">
          ${listName    ? `<span class="task-tag task-list-tag">${escHtml(listName)}</span>` : ''}
          ${deadlinePill}
          ${assigneeHtml}
        </div>
      </div>
    </div>`;
}

async function updateTaskStatus(id, status) {
  if (status === 'complete') launchConfetti();
  await fetch('/api/tasks', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status, adminCode: getAdminCode() }),
  });
  loadTasks();
}

// ── Task detail modal ─────────────────────────────────────
let detailTaskId = null;

async function openTaskDetail(taskId) {
  const t = allTasks.find(t => t.id === taskId);
  if (!t) return;
  detailTaskId = taskId;
  markTaskSeen(taskId);
  // Remove notification badges from all cards for this task (list + kanban)
  document.querySelectorAll(`[data-task-id="${taskId}"] .task-comment-badge`).forEach(el => el.remove());

  document.getElementById('taskDetailTitle').textContent = t.title;

  // Segmented status buttons
  const statuses = ['todo', 'in_progress', 'complete'];
  document.getElementById('taskDetailStatusBtns').innerHTML = statuses.map(s => `
    <button class="task-status-seg-btn ${t.status === s ? 'active ' + STATUS_COLORS[s] : ''}"
      onclick="adminSetTaskStatus('${t.id}', '${s}')">
      ${s === 'complete' ? '✓ ' : s === 'in_progress' ? '▶ ' : '○ '}${STATUS_LABELS[s]}
    </button>`).join('');

  // Meta pills (no status — it's shown above)
  const meta = [];
  if (t.deadline) {
    const fullDate = safeDate(t.deadline).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    meta.push(`<span class="task-deadline-pill ${deadlineClass(t.deadline, t.deadline_time)}" title="${fullDate}">Due ${fullDate}</span>`);
  }
  if (t.todo_lists?.name) meta.push(`<span class="task-tag">Folder: ${escHtml(t.todo_lists.name)}</span>`);
  document.getElementById('taskDetailMeta').innerHTML = meta.join('');
  document.getElementById('taskDetailDesc').textContent = t.description || '';

  const assignments = t.task_assignments || [];
  document.getElementById('taskDetailAssignees').innerHTML = assignments.length
    ? assignments.map(a => `
        <div class="task-detail-assignee">
          <div class="task-chip-avatar">${(a.assignee_name || a.assignee_email)[0].toUpperCase()}</div>
          <div style="flex:1;">
            <div class="text-sm" style="font-weight:600;">${escHtml(a.assignee_name || a.assignee_email)}</div>
            ${a.assignee_name ? `<div class="text-sm text-muted">${escHtml(a.assignee_email)}</div>` : ''}
          </div>
          <span class="task-tag ${a.completed_at ? 'tag-done' : ''}" style="margin-left:auto;">
            ${a.completed_at ? 'Done' : 'Pending'}
          </span>
        </div>`).join('')
    : '<span class="text-muted text-sm">No one assigned yet.</span>';

  document.getElementById('deleteTaskBtn').onclick = () => {
    if (confirm(`Delete "${t.title}"?`)) deleteTask(t.id);
  };
  document.getElementById('editTaskDetailBtn').onclick = () => { closeTaskDetail(); openTaskModal(t); };
  document.getElementById('adminCommentInput').value = '';

  show('taskDetailModal');
  loadDetailComments(taskId);
}

async function loadDetailComments(taskId) {
  document.getElementById('taskDetailComments').innerHTML = '<span class="text-muted text-sm">Loading…</span>';
  const res = await fetch(`/api/task-comments?taskId=${taskId}`);
  const comments = res.ok ? await res.json() : [];
  document.getElementById('taskDetailComments').innerHTML = comments.length
    ? comments.map(c => `
        <div class="task-comment">
          <div class="task-comment-author">${escHtml(c.author_name || c.author_email)}</div>
          <div class="task-comment-body">${escHtml(c.body)}</div>
          <div class="task-comment-time">${new Date(c.created_at).toLocaleString()}</div>
        </div>`).join('')
    : '<span class="text-muted text-sm">No comments yet.</span>';
}

async function adminSetTaskStatus(id, status) {
  await updateTaskStatus(id, status);
  // Re-render segmented buttons immediately
  const statuses = ['todo', 'in_progress', 'complete'];
  document.getElementById('taskDetailStatusBtns').innerHTML = statuses.map(s => `
    <button class="task-status-seg-btn ${status === s ? 'active ' + STATUS_COLORS[s] : ''}"
      onclick="adminSetTaskStatus('${id}', '${s}')">
      ${s === 'complete' ? '✓ ' : s === 'in_progress' ? '▶ ' : '○ '}${STATUS_LABELS[s]}
    </button>`).join('');
}

async function submitAdminComment() {
  const input = document.getElementById('adminCommentInput');
  const body  = input.value.trim();
  if (!body || !detailTaskId) return;
  const btn = input.nextElementSibling;
  btn.disabled = true;
  const res = await fetch('/api/task-comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: detailTaskId, commentBody: body, adminCode: getAdminCode() }),
  });
  btn.disabled = false;
  if (!res.ok) { showToast('Failed to post comment.', 'error'); return; }
  input.value = '';
  loadDetailComments(detailTaskId);
}

function closeTaskDetail() { hide('taskDetailModal'); detailTaskId = null; }

// ── Task create/edit modal ────────────────────────────────
const COMMON_TIMEZONES = [
  'America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
  'America/Anchorage','Pacific/Honolulu','America/Toronto','America/Vancouver',
  'America/Sao_Paulo','America/Buenos_Aires','America/Mexico_City',
  'Europe/London','Europe/Paris','Europe/Berlin','Europe/Rome','Europe/Madrid',
  'Europe/Amsterdam','Europe/Stockholm','Europe/Moscow','Africa/Johannesburg',
  'Asia/Dubai','Asia/Kolkata','Asia/Bangkok','Asia/Singapore','Asia/Shanghai',
  'Asia/Tokyo','Asia/Seoul','Australia/Sydney','Pacific/Auckland',
];

function _populateTimezoneSelect() {
  const sel = document.getElementById('taskTimezoneSelect');
  if (!sel || sel.options.length > 1) return; // already populated
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = COMMON_TIMEZONES.includes(local)
    ? COMMON_TIMEZONES
    : [local, ...COMMON_TIMEZONES];
  sel.innerHTML = zones.map(tz =>
    `<option value="${tz}" ${tz === local ? 'selected' : ''}>${tz.replace(/_/g,' ')}</option>`
  ).join('');
}

function openTaskModal(task = null) {
  editingTaskId = task?.id || null;
  document.getElementById('taskModalTitle').textContent = task ? 'Edit Task' : 'New Task';
  document.getElementById('confirmTaskBtn').textContent = task ? 'Save Changes' : 'Create Task';
  document.getElementById('taskTitleInput').value = task?.title || '';
  document.getElementById('taskDescInput').value  = task?.description || '';
  document.getElementById('taskDeadlineInput').value = task?.deadline ? task.deadline.slice(0,10) : '';
  document.getElementById('taskDeadlineTimeInput').value = task?.deadline_time || '';
  _populateTimezoneSelect();
  if (task?.deadline_tz) {
    const sel = document.getElementById('taskTimezoneSelect');
    if (sel) sel.value = task.deadline_tz;
  }
  document.getElementById('taskModalError').classList.add('hidden');
  // Reset inline list form if open
  toggleInlineNewList(false);

  // Populate list select
  const sel = document.getElementById('taskListSelect');
  sel.innerHTML = '<option value="">— No folder —</option>' +
    allTaskLists.map(l => `<option value="${l.id}" ${task?.list_id === l.id ? 'selected' : ''}>${escHtml(l.name)}</option>`).join('');
  sel.onchange = () => {
    // Pre-populate default assignees when folder changes (new task only, don't override editing)
    if (!editingTaskId) _applyFolderDefaultAssignees(sel.value);
  };

  // Render existing assignees (for new task, also apply folder defaults if folder pre-selected)
  if (task) {
    renderTaskAssignees(task.task_assignments || []);
  } else {
    renderTaskAssignees([]);
    if (sel.value) _applyFolderDefaultAssignees(sel.value);
  }

  // Load contact picker
  loadContactsForTaskPicker(task?.task_assignments || []);

  hide('taskAssignPicker');
  show('newTaskModal');
  document.getElementById('taskTitleInput').focus();
}

function closeTaskModal() {
  hide('newTaskModal');
  editingTaskId = null;
}

// Assignee management inside task modal
let taskAssigneeList = []; // [{name, email}]

function renderTaskAssignees(assignments) {
  taskAssigneeList = assignments.map(a => ({ name: a.assignee_name || a.name || '', email: a.assignee_email || a.email }));
  refreshTaskAssigneeDisplay();
}

function _applyFolderDefaultAssignees(listId) {
  if (!listId) return;
  const folder = allTaskLists.find(l => l.id === listId);
  const defaults = folder?.default_assignees || [];
  if (!defaults.length) return;
  // Add defaults that aren't already in the list
  const existing = new Set(taskAssigneeList.map(a => a.email));
  defaults.forEach(a => { if (a.email && !existing.has(a.email)) taskAssigneeList.push({ name: a.name || '', email: a.email }); });
  refreshTaskAssigneeDisplay();
  loadContactsForTaskPicker(taskAssigneeList);
}

function refreshTaskAssigneeDisplay() {
  const el = document.getElementById('taskAssignees');
  if (!taskAssigneeList.length) {
    el.innerHTML = '<span class="text-muted text-sm">No one assigned yet.</span>';
    return;
  }
  el.innerHTML = taskAssigneeList.map((a, i) => `
    <div class="task-assignee-row">
      <div class="task-chip-avatar">${(a.name || a.email)[0].toUpperCase()}</div>
      <span>${escHtml(a.name || a.email)}</span>
      <button class="btn-icon text-danger" onclick="removeTaskAssignee(${i})" style="margin-left:auto;">✕</button>
    </div>`).join('');
}

function removeTaskAssignee(idx) {
  taskAssigneeList.splice(idx, 1);
  refreshTaskAssigneeDisplay();
  loadContactsForTaskPicker(taskAssigneeList);
}

function loadContactsForTaskPicker(currentAssignments) {
  renderAssignPickerWith('', currentAssignments);
}

function filterAssignPicker(query) {
  renderAssignPickerWith(query, taskAssigneeList);
}

function renderAssignPickerWith(query, currentAssignments) {
  const list = document.getElementById('taskAssignPickerList');
  if (!contactGroups.length) {
    list.innerHTML = '<span class="text-muted text-sm">No contacts loaded — visit Contacts tab first.</span>';
    return;
  }
  const assignedEmails = new Set((currentAssignments || taskAssigneeList).map(a => a.email || a.assignee_email));
  const q = (query || '').toLowerCase();

  const html = contactGroups.map(g => {
    const available = (g.members || []).filter(m => {
      if (assignedEmails.has(m.email)) return false;
      if (!q) return true;
      return (m.name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q);
    });
    if (!available.length) return '';
    return `
      <div style="margin-bottom:0.4rem;">
        ${q ? '' : `<div class="text-sm" style="font-weight:600;color:var(--text-muted);margin-bottom:0.2rem;">${escHtml(g.name)}</div>`}
        ${available.map(m => `
          <label class="contact-picker-item" style="display:flex;align-items:center;gap:0.5rem;padding:0.3rem 0.4rem;cursor:pointer;border-radius:6px;">
            <input type="checkbox" onchange="toggleTaskAssignee(this, '${escHtml(m.name)}', '${escHtml(m.email)}')" />
            <span style="font-weight:500;">${escHtml(m.name || m.email)}</span>
            ${m.email && m.name ? `<span class="text-muted text-sm" style="margin-left:auto;">${escHtml(m.email)}</span>` : ''}
          </label>`).join('')}
      </div>`;
  }).join('');

  list.innerHTML = html || '<span class="text-muted text-sm">No matches.</span>';
}

function toggleTaskAssignee(checkbox, name, email) {
  if (checkbox.checked) {
    taskAssigneeList.push({ name, email });
    // Clear search and re-render picker without the newly added person
    const searchEl = document.getElementById('assignPickerSearch');
    if (searchEl) { searchEl.value = ''; }
    renderAssignPickerWith('', taskAssigneeList);
  } else {
    taskAssigneeList = taskAssigneeList.filter(a => a.email !== email);
    renderAssignPickerWith(document.getElementById('assignPickerSearch')?.value || '', taskAssigneeList);
  }
  refreshTaskAssigneeDisplay();
}

async function saveTask() {
  const title         = document.getElementById('taskTitleInput').value.trim();
  const desc          = document.getElementById('taskDescInput').value.trim();
  const deadline      = document.getElementById('taskDeadlineInput').value;
  const deadlineTime  = document.getElementById('taskDeadlineTimeInput').value || null;
  const deadlineTz    = document.getElementById('taskTimezoneSelect').value || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const listId        = document.getElementById('taskListSelect').value;
  const errEl         = document.getElementById('taskModalError');

  errEl.classList.add('hidden');
  if (!title) { errEl.textContent = 'Title is required.'; errEl.classList.remove('hidden'); return; }

  const btn = document.getElementById('confirmTaskBtn');
  btn.disabled = true;

  try {
    const body = {
      title, description: desc || null,
      deadline: deadline || null,
      deadline_time: deadlineTime,
      deadline_tz: deadline ? deadlineTz : null,
      list_id: listId || null,
      assignments: taskAssigneeList,
      adminCode: getAdminCode(),
    };

    const res = await fetch('/api/tasks', {
      method: editingTaskId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingTaskId ? { ...body, id: editingTaskId } : body),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed.');
    closeTaskModal();
    showToast(editingTaskId ? 'Task updated.' : 'Task created!', 'success');
    loadTasks();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
}

async function deleteTask(id) {
  await fetch('/api/tasks', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, adminCode: getAdminCode() }),
  });
  closeTaskDetail();
  showToast('Task deleted.', 'success');
  loadTasks();
}

// ── Clear completed tasks ─────────────────────────────────
async function clearCompletedTasks(listId) {
  // listId = null → all lists; listId = '' → General; listId = uuid → specific list
  const shared    = allTasks.filter(t => !t.is_private && t.status === 'complete');
  const toDelete  = listId === null
    ? shared
    : shared.filter(t => (t.list_id || '') === (listId || ''));

  if (!toDelete.length) {
    showToast('No completed tasks to clear.', 'info');
    return;
  }

  const scope = listId === null ? 'all folders' : (listId ? (allTaskLists.find(l => l.id === listId)?.name || 'this folder') : 'No Folder');
  if (!confirm(`Delete ${toDelete.length} completed task${toDelete.length > 1 ? 's' : ''} from ${scope}? This cannot be undone.`)) return;

  const ids = toDelete.map(t => t.id);
  const res = await fetch('/api/tasks', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, adminCode: getAdminCode() }),
  });
  if (!res.ok) { showToast('Failed to clear tasks.', 'error'); return; }

  allTasks = allTasks.filter(t => !ids.includes(t.id));
  showToast(`Cleared ${ids.length} completed task${ids.length > 1 ? 's' : ''}.`, 'success');
  applyTaskFilters();
}

// ── List create/delete ────────────────────────────────────
function openListModal() {
  document.getElementById('listNameInput').value = '';
  document.getElementById('listModalError').classList.add('hidden');
  renderListManagerRows();
  show('newListModal');
  setTimeout(() => document.getElementById('listNameInput').focus(), 80);
}

function closeListModal() { hide('newListModal'); }

function renderListManagerRows() {
  const container = document.getElementById('listManagerRows');
  if (!container) return;
  if (!allTaskLists.length) {
    container.innerHTML = '<p class="text-muted text-sm" style="text-align:center;padding:0.5rem 0;">No folders yet.</p>';
    return;
  }
  container.innerHTML = allTaskLists.map(l => {
    const defaults = (l.default_assignees || []);
    const chips = defaults.map((a, i) =>
      `<span class="task-chip" style="font-size:0.75rem;">${escHtml(a.name || a.email)}<button class="btn-icon" style="margin-left:0.2rem;font-size:0.7rem;line-height:1;" onclick="removeDefaultAssignee('${l.id}',${i})">✕</button></span>`
    ).join('');
    return `
    <div class="list-manager-row" id="list-row-${l.id}" style="flex-direction:column;align-items:stretch;gap:0.4rem;">
      <div style="display:flex;align-items:center;gap:0.4rem;">
        <input class="list-manager-input" id="list-name-${l.id}" value="${escHtml(l.name)}"
          style="flex:1;"
          onkeydown="if(event.key==='Enter'){event.preventDefault();renameList('${l.id}');}if(event.key==='Escape'){this.value=allTaskLists.find(x=>x.id==='${l.id}')?.name||'';}" />
        <button class="btn btn-secondary btn-sm" onclick="renameList('${l.id}')">Save</button>
        <button class="btn-icon text-danger" onclick="deleteList('${l.id}')" title="Delete folder">✕</button>
      </div>
      <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;padding-left:0.25rem;">
        <span style="font-size:0.72rem;color:var(--text-muted);font-weight:600;">Default:</span>
        ${chips}
        <button class="btn btn-ghost btn-sm" style="font-size:0.72rem;padding:0.15rem 0.45rem;" onclick="openDefaultAssigneePicker('${l.id}')">+ Add</button>
      </div>
    </div>`;
  }).join('');
}

async function openDefaultAssigneePicker(listId) {
  const list = allTaskLists.find(l => l.id === listId);
  if (!list) return;
  if (!contactGroups.length) await ensureContactsLoaded();
  const alreadyEmails = new Set((list.default_assignees || []).map(a => a.email));
  const allContacts = (contactGroups || []).flatMap(g => g.members || []);
  const available = allContacts.filter(m => m.email && !alreadyEmails.has(m.email));

  if (!available.length) { showToast('No more contacts to add.', 'success'); return; }

  // Simple prompt-style select via a quick inline dropdown in the row
  const existingPicker = document.getElementById('defaultAssigneePicker');
  if (existingPicker) existingPicker.remove();

  const picker = document.createElement('div');
  picker.id = 'defaultAssigneePicker';
  picker.style.cssText = 'position:fixed;z-index:999;background:#fff;border:1.5px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.12);padding:0.4rem 0;min-width:200px;max-height:220px;overflow-y:auto;';
  picker.innerHTML = available.map(m => `
    <div style="padding:0.4rem 0.75rem;cursor:pointer;font-size:0.85rem;"
      onmouseenter="this.style.background='var(--primary-pale)'"
      onmouseleave="this.style.background=''"
      onclick="addDefaultAssignee('${listId}','${escHtml(m.name)}','${escHtml(m.email)}');document.getElementById('defaultAssigneePicker')?.remove()">
      <strong>${escHtml(m.name || m.email)}</strong>
      ${m.email && m.name ? `<span style="color:var(--text-muted);font-size:0.75em;margin-left:0.3rem;">${escHtml(m.email)}</span>` : ''}
    </div>`).join('');

  document.body.appendChild(picker);
  // Position near the Add button
  const btn = document.querySelector(`#list-row-${listId} button[onclick*="openDefaultAssigneePicker"]`);
  if (btn) {
    const r = btn.getBoundingClientRect();
    picker.style.top = `${r.bottom + 4}px`;
    picker.style.left = `${r.left}px`;
  }
  // Close on outside click
  setTimeout(() => document.addEventListener('click', function _close(e) {
    if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('click', _close); }
  }), 50);
}

async function addDefaultAssignee(listId, name, email) {
  const list = allTaskLists.find(l => l.id === listId);
  if (!list) return;
  const defaults = [...(list.default_assignees || []), { name, email }];
  await _saveDefaultAssignees(listId, defaults);
}

async function removeDefaultAssignee(listId, idx) {
  const list = allTaskLists.find(l => l.id === listId);
  if (!list) return;
  const defaults = (list.default_assignees || []).filter((_, i) => i !== idx);
  await _saveDefaultAssignees(listId, defaults);
}

async function _saveDefaultAssignees(listId, defaults) {
  const res = await fetch('/api/task-lists', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: listId, default_assignees: defaults, adminCode: getAdminCode() }),
  });
  if (!res.ok) { showToast('Failed to save.', 'error'); return; }
  const list = allTaskLists.find(l => l.id === listId);
  if (list) list.default_assignees = defaults;
  renderListManagerRows();
}

async function renameList(id) {
  const input = document.getElementById(`list-name-${id}`);
  const name  = input?.value.trim();
  if (!name) { input?.focus(); return; }
  const original = allTaskLists.find(l => l.id === id)?.name;
  if (name === original) return;

  const btn = input?.nextElementSibling;
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/task-lists', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, adminCode: getAdminCode() }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed.');
    const updated = allTaskLists.find(l => l.id === id);
    if (updated) updated.name = name;
    showToast(`Renamed to "${name}"`, 'success');
    // Refresh the tasks body so group headers update (no full reload needed)
    applyTaskFilters();
  } catch (e) {
    showToast(e.message, 'error');
    if (input) input.value = original || '';
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Inline list creation (inside task modal) ──────────────
function toggleInlineNewList(forceOpen) {
  const form  = document.getElementById('inlineNewListForm');
  const input = document.getElementById('inlineListNameInput');
  const isHidden = form.classList.contains('hidden');
  const open  = forceOpen !== undefined ? forceOpen : isHidden;
  form.classList.toggle('hidden', !open);
  if (open) { input.value = ''; setTimeout(() => input.focus(), 50); }
}

async function saveInlineList() {
  const input = document.getElementById('inlineListNameInput');
  const name  = input.value.trim();
  if (!name) { input.focus(); return; }

  const btn = document.querySelector('#inlineNewListForm .btn-primary');
  btn.disabled = true;
  try {
    const res = await fetch('/api/task-lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, adminCode: getAdminCode() }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed.');
    const newList = await res.json();
    // Add to in-memory list and select it immediately
    allTaskLists.push(newList);
    const sel = document.getElementById('taskListSelect');
    const opt = document.createElement('option');
    opt.value = newList.id;
    opt.textContent = name;
    opt.selected = true;
    sel.appendChild(opt);
    toggleInlineNewList(false);
    showToast(`Folder "${name}" created!`, 'success');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function saveList() {
  const input = document.getElementById('listNameInput');
  const name  = input.value.trim();
  const errEl = document.getElementById('listModalError');
  errEl.classList.add('hidden');
  if (!name) { errEl.textContent = 'Name required.'; errEl.classList.remove('hidden'); input.focus(); return; }

  const btn = document.getElementById('confirmListBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/task-lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, adminCode: getAdminCode() }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed.');
    const newList = await res.json();
    allTaskLists.push(newList);
    input.value = '';
    showToast(`Folder "${name}" created!`, 'success');
    renderListManagerRows();
    applyTaskFilters();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    input.focus();
  }
}

async function deleteList(id) {
  const list = allTaskLists.find(l => l.id === id);
  if (!confirm(`Delete folder "${list?.name}"? Tasks in it will become unfoldered.`)) return;
  const res = await fetch('/api/task-lists', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, adminCode: getAdminCode() }),
  });
  if (!res.ok) { showToast('Failed to delete folder.', 'error'); return; }
  allTaskLists = allTaskLists.filter(l => l.id !== id);
  allTasks.forEach(t => { if (t.list_id === id) t.list_id = null; });
  showToast('Folder deleted.', 'success');
  renderListManagerRows();
  applyTaskFilters();
}

// ── Copy summary for one list ─────────────────────────────
// ── Shared task line formatter ────────────────────────────
function formatTaskLine(t) {
  const inProgress = t.status === 'in_progress';
  let dueFmt = null;
  if (t.deadline) {
    const dateStr = safeDate(t.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timeStr = t.deadline_time ? ` at ${_fmt12h(t.deadline_time)}` : '';
    dueFmt = dateStr + timeStr;
  }
  const assignees  = (t.task_assignments || []).map(a => a.assignee_name || a.assignee_email).join(', ');
  const parts      = [inProgress ? 'In Progress' : null, assignees || null, dueFmt ? `Due ${dueFmt}` : null].filter(Boolean);
  return `• ${inProgress ? '*' : ''}${t.title}${inProgress ? '*' : ''}${parts.length ? ' (' + parts.join(', ') + ')' : ''}`;
}

function _fmt12h(timeStr) {
  // "14:30" → "2:30 PM"
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function copyListSummary(listId) {
  const listName = listId ? (allTaskLists.find(l => l.id === listId)?.name || 'No Folder') : 'No Folder';
  const tasks = allTasks.filter(t =>
    !t.is_private && t.status !== 'complete' && (t.list_id || null) === (listId || null)
  );
  if (!tasks.length) { showToast('No active tasks in this list.', 'success'); return; }

  const shareUrl = `${location.origin}/tasks`;
  const lines = [
    `*${listName}*`,
    '',
    ...tasks.map(formatTaskLine),
    '',
    shareUrl,
  ];

  navigator.clipboard.writeText(lines.join('\n'))
    .then(() => showToast(`"${listName}" summary copied!`, 'success'))
    .catch(() => showToast('Could not copy.', 'error'));
}

// ── Generate summary ──────────────────────────────────────
function generateTaskSummary() {
  const shared = allTasks.filter(t => !t.is_private && t.status !== 'complete');
  if (!shared.length) { showToast('No active tasks to summarize.', 'success'); return; }

  const byList = new Map();
  allTaskLists.forEach(l => byList.set(l.id, { name: l.name, tasks: [] }));
  byList.set(null, { name: 'No Folder', tasks: [] });

  shared.forEach(t => {
    const key = t.list_id && byList.has(t.list_id) ? t.list_id : null;
    byList.get(key).tasks.push(t);
  });

  const sections = [];
  byList.forEach(({ name, tasks }) => {
    if (!tasks.length) return;
    sections.push(`*${name}*`);
    tasks.forEach(t => sections.push(formatTaskLine(t)));
    sections.push('');
  });

  const shareUrl = `${location.origin}/tasks`;
  sections.push(shareUrl);

  navigator.clipboard.writeText(sections.join('\n').trimEnd())
    .then(() => showToast('Summary copied!', 'success'))
    .catch(() => showToast('Could not copy.', 'error'));
}

// ── Create schedule ────────────────────────────────────────
function bindUI() {
  // Timezone selector
  const tzSel = document.getElementById('adminTzSelect');
  if (tzSel) {
    tzSel.innerHTML = buildTimezoneOptions(getAdminTimezone());
    tzSel.addEventListener('change', () => {
      setAdminTimezone(tzSel.value);
      const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
      if (activeTab) switchTab(activeTab);
    });
  }

  // Filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      applyScheduleFilters();
    });
  });

  // Sort select
  document.getElementById('scheduleSort').addEventListener('change', applyScheduleFilters);

  document.getElementById('createGroupBtn').addEventListener('click', () => {
    loadContactsForPicker();
    show('createGroupModal');
    document.getElementById('newGroupName').focus();
  });
  document.getElementById('closeCreateModal').addEventListener('click', closeCreateModal);
  document.getElementById('cancelCreateGroup').addEventListener('click', closeCreateModal);
  document.getElementById('confirmCreateGroup').addEventListener('click', createGroup);
  document.getElementById('newGroupName').addEventListener('keydown', e => {
    if (e.key === 'Enter') createGroup();
  });
  document.getElementById('logoutBtn').addEventListener('click', () => {
    clearAdminSession(); clearGoogleToken();
    window.location.href = '/';
  });

  // Contact group modal
  document.getElementById('createContactGroupBtn').addEventListener('click', () => openContactGroupModal());
  document.getElementById('closeContactGroupModal').addEventListener('click', closeContactGroupModal);
  document.getElementById('cancelContactGroup').addEventListener('click', closeContactGroupModal);
  document.getElementById('confirmContactGroup').addEventListener('click', saveContactGroup);
  document.getElementById('addContactMemberBtn').addEventListener('click', addContactMemberRow);

  // Edit schedule modal
  document.getElementById('detailEditBtn').addEventListener('click', openEditScheduleModal);
  document.getElementById('closeEditScheduleModal').addEventListener('click', closeEditScheduleModal);
  document.getElementById('cancelEditSchedule').addEventListener('click', closeEditScheduleModal);
  document.getElementById('confirmEditSchedule').addEventListener('click', saveScheduleEdits);

  // Tasks
  document.getElementById('addPrivateTaskBtn').addEventListener('click', () => {
    document.getElementById('privateTaskInput').classList.remove('hidden');
    document.getElementById('privateTaskTitle').focus();
  });
  document.getElementById('privateTaskTitle').addEventListener('keydown', e => {
    if (e.key === 'Enter') savePrivateTask();
    if (e.key === 'Escape') cancelPrivateTask();
  });
  document.getElementById('newTaskBtn').addEventListener('click', () => {
    if (!contactGroups.length) ensureContactsLoaded();
    openTaskModal();
  });
  document.getElementById('newListBtn').addEventListener('click', () => openListModal());
  document.getElementById('generateSummaryBtn').addEventListener('click', generateTaskSummary);
  document.getElementById('openAssignPickerBtn').addEventListener('click', () => {
    const picker = document.getElementById('taskAssignPicker');
    const isHidden = picker.classList.contains('hidden');
    picker.classList.toggle('hidden', !isHidden);
    if (isHidden) {
      document.getElementById('assignPickerSearch').value = '';
      if (!contactGroups.length) ensureContactsLoaded();
      loadContactsForTaskPicker(taskAssigneeList);
      setTimeout(() => document.getElementById('assignPickerSearch').focus(), 50);
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    // Ignore when typing in an input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    // N → open new task modal (only when in tasks view)
    if (e.key === 'n' || e.key === 'N') {
      const tasksSection = document.getElementById('tasksSection');
      if (tasksSection && !tasksSection.classList.contains('hidden')) {
        e.preventDefault();
        openTaskModal();
      }
    }

    // Escape → close any open modal
    if (e.key === 'Escape') {
      const modals = ['taskDetailModal', 'newTaskModal', 'newListModal', 'pubTaskDetailModal', 'notesImportModal'];
      for (const id of modals) {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) {
          el.classList.add('hidden');
          break;
        }
      }
    }
  });

  // Silent comment polling — refresh tasks every 60s when no modal is open
  setInterval(async () => {
    const modals = ['taskDetailModal', 'newTaskModal', 'newListModal', 'pubTaskDetailModal', 'notesImportModal'];
    const anyOpen = modals.some(id => {
      const el = document.getElementById(id);
      return el && !el.classList.contains('hidden');
    });
    if (anyOpen) return;
    const tasksSection = document.getElementById('tasksSection');
    if (!tasksSection || tasksSection.classList.contains('hidden')) return;
    // Silently reload tasks + update badges without showing loading spinner
    try {
      const [tasksRes, listsRes] = await Promise.all([
        fetch(`/api/tasks?adminCode=${encodeURIComponent(getAdminCode())}`),
        fetch(`/api/task-lists?adminCode=${encodeURIComponent(getAdminCode())}`),
      ]);
      if (!tasksRes.ok || !listsRes.ok) return;
      allTasks = await tasksRes.json();
      allTaskLists = await listsRes.json();
      updateOverdueBanner();
      if (taskViewMode === 'list') applyTaskFilters();
      else if (taskViewMode === 'calendar') renderCalendar();
    } catch {}
  }, 60000);
}

function closeCreateModal() {
  hide('createGroupModal');
  document.getElementById('newGroupName').value = '';
  document.getElementById('newGroupDesc').value = '';
  document.getElementById('newGroupExpected').value = '';
  document.getElementById('newGroupSlug').value = '';
  document.getElementById('createGroupError').classList.add('hidden');
  // Reset specific-dates state
  createGroupMode  = 'weekly';
  createGroupDates = [];
  createSetMode('weekly');
}

async function createGroup() {
  const name       = document.getElementById('newGroupName').value.trim();
  const desc       = document.getElementById('newGroupDesc').value.trim();
  const expected   = document.getElementById('newGroupExpected').value
    .split('\n').map(s => s.trim()).filter(Boolean);
  const customSlug = document.getElementById('newGroupSlug').value.trim()
    .toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
  const errEl = document.getElementById('createGroupError');
  errEl.classList.add('hidden');

  if (!name) { errEl.textContent = 'Please enter a group name.'; errEl.classList.remove('hidden'); return; }
  if (customSlug && customSlug.length < 3) {
    errEl.textContent = 'Custom link must be at least 3 characters.';
    errEl.classList.remove('hidden'); return;
  }

  const btn = document.getElementById('confirmCreateGroup');
  btn.disabled = true; btn.textContent = 'Creating…';

  try {
    const res = await fetch('/api/create-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: desc, expectedMembers: expected, customSlug: customSlug || undefined, adminCode: getAdminCode(), schedule_mode: createGroupMode, date_window: createGroupDates }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed to create group.');

    closeCreateModal();
    showToast(`Group "${name}" created!`, 'success');
    await loadGroups();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = 'Create Group →';
  }
}

// ── Delete group ──────────────────────────────────────────
async function confirmDeleteGroup(groupId, groupName) {
  if (!confirm(`Delete "${groupName}"? This will remove all member data and cannot be undone.`)) return;
  const { error } = await db.from('groups').delete().eq('id', groupId);
  if (error) { showToast('Failed to delete group.', 'error'); return; }
  showToast(`"${groupName}" deleted.`, 'success');
  await loadGroups();
}

// ── Schedule meeting modal ────────────────────────────────
let selectedRec = null, selectedDate = null, selectedStartTime = null;

function openScheduleModal() {
  // Show suggested times section, normal label
  document.getElementById('scheduleStep1').classList.remove('hidden');
  document.getElementById('scheduleTimeLabelNormal').classList.remove('hidden');
  document.getElementById('scheduleTimeLabelSlot').classList.add('hidden');

  // Reset recurrence UI
  const recSel = document.getElementById('meetingRecurrence');
  if (recSel) { recSel.value = ''; document.getElementById('untilDateGroup').style.display = 'none'; }

  // Compute recs from timezone-converted members
  const recs = getRecommendedTimes(getMembersInAdminTz());
  selectedRec = recs[0] || null;

  // Build recommended time options
  const optionsEl = document.getElementById('recTimeOptions');
  if (recs.length) {
    optionsEl.innerHTML = recs.slice(0, 3).map((r, i) => `
      <button class="time-option-btn ${i === 0 ? 'selected' : ''} ${r.allAvailable ? 'best' : ''}"
        data-rec-idx="${i}" onclick="selectRecTime(this, ${i})">
        <div class="time-option-badge">${i + 1}</div>
        <div>
          <div style="font-weight:600;">${DAYS[r.day]} : ${slotRangeLabel(r.startSlot, r.endSlot)}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);">
            ${r.allAvailable ? '🎉 Everyone available' : `${r.count}/${r.total} available`}
          </div>
        </div>
      </button>`).join('');

    // Set date/time from first rec
    if (selectedRec) prefillDateTimeFromRec(selectedRec);
  } else {
    optionsEl.innerHTML = '<p class="text-muted text-sm">No recommended times yet : you can still pick a custom time below.</p>';
  }

  // Build attendee checklist
  const attendeeList = document.getElementById('attendeeList');
  attendeeList.innerHTML = groupMembers.map(m => `
    <label class="attendee-item">
      <input type="checkbox" checked data-email="${escHtml(m.email)}" data-name="${escHtml(m.name)}" />
      <span class="attendee-name">${escHtml(m.name)}</span>
      <span class="attendee-email">${escHtml(m.email)}</span>
    </label>`).join('') || '<p class="text-muted text-sm">No members in this group yet.</p>';

  // Google status
  const token = getGoogleToken();
  const warning = document.getElementById('googleWarning');
  const scheduleConnectBtn = document.getElementById('scheduleConnectGoogle');
  if (token) {
    warning.classList.add('hidden');
  } else {
    warning.classList.remove('hidden');
    scheduleConnectBtn.onclick = () => { requestGoogleToken(); hide('googleWarning'); };
  }

  // Pre-fill meeting title
  document.getElementById('meetingTitle').value = currentGroup?.name ? `${currentGroup.name} Meeting` : '';
  document.getElementById('scheduleError').classList.add('hidden');
  document.getElementById('scheduleSuccess').classList.add('hidden');

  show('scheduleModal');
}

function selectRecTime(btn, idx) {
  document.querySelectorAll('.time-option-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const recs = getRecommendedTimes(groupMembers);
  selectedRec = recs[idx];
  if (selectedRec) prefillDateTimeFromRec(selectedRec);
}

function prefillDateTimeFromRec(rec) {
  const nextDate = nextWeekday(rec.day);
  document.getElementById('customDate').value      = toDateInputValue(nextDate);
  document.getElementById('customStartTime').value = slotTo24h(rec.startSlot);
  selectedDate      = toDateInputValue(nextDate);
  selectedStartTime = slotTo24h(rec.startSlot);
}

// Called from rec-times tab "Schedule This →" button
function prefillSchedule(rec) {
  openScheduleModal();
  selectedRec = rec;
  prefillDateTimeFromRec(rec);
}

// Called from heatmap "Schedule at This Time" button
function scheduleFromHeatmapSlot(day, slot) {
  openScheduleModal();

  // Hide suggested times, show the chosen slot as a simple label
  document.getElementById('scheduleStep1').classList.add('hidden');
  document.getElementById('scheduleTimeLabelNormal').classList.add('hidden');
  document.getElementById('scheduleTimeLabelSlot').classList.remove('hidden');
  document.getElementById('slotTimeLabel').textContent =
    `${DAYS[day]} at ${slotToTime(slot)}`;

  selectedRec = { day, startSlot: slot };
  prefillDateTimeFromRec({ day, startSlot: slot });
}

document.getElementById('closeScheduleModal').addEventListener('click', () => hide('scheduleModal'));
document.getElementById('cancelSchedule').addEventListener('click',      () => hide('scheduleModal'));

document.getElementById('confirmSchedule').addEventListener('click', async () => {
  const title    = document.getElementById('meetingTitle').value.trim();
  const date     = document.getElementById('customDate').value;
  const startStr = document.getElementById('customStartTime').value;
  const duration = +document.getElementById('meetingDuration').value;
  const location = document.getElementById('meetingLocation').value.trim();
  const notes    = document.getElementById('meetingNotes').value.trim();
  const errEl    = document.getElementById('scheduleError');
  const succEl   = document.getElementById('scheduleSuccess');
  errEl.classList.add('hidden');
  succEl.classList.add('hidden');

  if (!title) { showScheduleError('Please enter a meeting title.'); return; }
  if (!date)  { showScheduleError('Please select a date.'); return; }
  if (!startStr) { showScheduleError('Please select a start time.'); return; }

  // Collect attendees
  const attendees = [...document.querySelectorAll('#attendeeList input[type="checkbox"]:checked')]
    .map(cb => ({ email: cb.dataset.email, displayName: cb.dataset.name }));

  // Compute end time
  const [sh, sm] = startStr.split(':').map(Number);
  const endMin   = sh * 60 + sm + duration * 30;
  const eh = Math.floor(endMin / 60), em = endMin % 60;
  const endStr   = `${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`;
  const tz       = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const token = getGoogleToken();
  if (!token) {
    showScheduleError('Please connect Google Calendar first to send invites.');
    show('googleWarning');
    return;
  }

  setScheduleLoading(true);

  const event = {
    summary: title,
    location,
    description: notes,
    start: { dateTime: `${date}T${startStr}:00`, timeZone: tz },
    end:   { dateTime: `${date}T${endStr}:00`,   timeZone: tz },
    attendees,
    reminders: { useDefault: true },
  };

  // Add recurrence rule if selected
  const recurrence = document.getElementById('meetingRecurrence')?.value;
  const untilDate  = document.getElementById('meetingUntil')?.value;
  if (recurrence) {
    let freq = recurrence === 'BIWEEKLY' ? 'WEEKLY;INTERVAL=2' : recurrence;
    let rrule = `RRULE:FREQ=${freq}`;
    if (untilDate) rrule += `;UNTIL=${untilDate.replace(/-/g,'')}T235959Z`;
    event.recurrence = [rrule];
  }

  try {
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }
    );

    if (!res.ok) {
      const err = await res.json();
      if (err.error?.status === 'UNAUTHENTICATED') {
        clearGoogleToken(); show('googleWarning');
        showScheduleError('Google token expired. Please reconnect Google Calendar.');
        return;
      }
      throw new Error(err.error?.message || 'Google Calendar error.');
    }

    const created = await res.json();
    succEl.innerHTML = `✓ Event created! <a href="${created.htmlLink}" target="_blank" style="font-weight:700;">View in Google Calendar →</a>`;
    succEl.classList.remove('hidden');
    showToast('Meeting created and invites sent!', 'success');
    // Mark this group as scheduled so the card shows "Scheduled!"
    if (currentGroup?.id) {
      localStorage.setItem(`claire_scheduled_${currentGroup.id}`, new Date().toISOString());
    }
  } catch (e) {
    showScheduleError(e.message);
  } finally {
    setScheduleLoading(false);
  }
});

function showScheduleError(msg) {
  const el = document.getElementById('scheduleError');
  el.textContent = msg; el.classList.remove('hidden');
}
function setScheduleLoading(on) {
  const btn = document.getElementById('confirmSchedule');
  btn.disabled = on;
  document.getElementById('scheduleButtonText').classList.toggle('hidden', on);
  document.getElementById('scheduleSpinner').classList.toggle('hidden', !on);
}

// ── Google Calendar auth ──────────────────────────────────
function setupGoogleAuth() {
  const { googleClientId } = window.CLAIRE_CONFIG;
  const statusText = document.getElementById('googleStatusText');
  const connectBtn = document.getElementById('googleConnectBtn');

  if (!googleClientId || googleClientId === 'YOUR_GOOGLE_CLIENT_ID') {
    statusText.innerHTML = '<span class="google-disconnected" style="font-size:0.8rem;">Google not configured (see SETUP.md)</span>';
    connectBtn.style.display = 'none';
    return;
  }

  const token = getGoogleToken();
  if (token) { setGoogleConnected(); } else { setGoogleDisconnected(); }

  connectBtn.addEventListener('click', requestGoogleToken);
}

function requestGoogleToken() {
  const { googleClientId } = window.CLAIRE_CONFIG;
  if (!googleClientId || googleClientId === 'YOUR_GOOGLE_CLIENT_ID') {
    showToast('Google Client ID not configured. See SETUP.md.', 'error'); return;
  }

  if (!googleTokenClient) {
    googleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/gmail.send',
      callback: (resp) => {
        if (resp.error) { showToast('Google sign-in failed.', 'error'); return; }
        saveGoogleToken(resp.access_token, resp.expires_in || 3600);
        setGoogleConnected();
        showToast('Google Calendar connected!', 'success');
      },
    });
  }
  googleTokenClient.requestAccessToken();
}

function setGoogleConnected() {
  document.getElementById('googleStatusText').innerHTML =
    '<span class="google-connected">✓ Google Calendar connected</span>';
  document.getElementById('googleConnectBtn').textContent = 'Reconnect';
}
function setGoogleDisconnected() {
  document.getElementById('googleStatusText').innerHTML =
    '<span class="google-disconnected">Not connected to Google</span>';
  document.getElementById('googleConnectBtn').textContent = 'Connect';
}

// ── Nudge ─────────────────────────────────────────────────
function buildGmailRaw(to, subject, html) {
  const msg = [
    `To: ${to}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    `Subject: ${subject}`,
    '',
    html,
  ].join('\r\n');
  // Base64url encode (handles unicode)
  return btoa(
    encodeURIComponent(msg).replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function nudgeMembers() {
  const token = getGoogleToken();
  if (!token) {
    showToast('Connect Google first to send emails.', 'error');
    return;
  }

  // Collect pending emails only (skip name-only entries)
  const expected = currentGroup?.expected_members || [];
  const responded = new Set(groupMembers.map(m => m.email.toLowerCase()));
  const pendingEmails = expected
    .map(e => parseExpectedEntry(e).email)
    .filter(email => email && !responded.has(email));

  if (!pendingEmails.length) {
    showToast('No email addresses to nudge — add emails to the expected list.', 'info');
    return;
  }

  const btn = document.getElementById('nudgeBtn');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  const link = groupLink(currentGroup.slug);
  const groupName = escHtml(currentGroup.name);
  let sent = 0, failed = 0;

  for (const email of pendingEmails) {
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
        <div style="background:#F59E0B;border-radius:12px;padding:6px 16px;display:inline-block;margin-bottom:20px;">
          <span style="color:#fff;font-weight:700;font-size:1.1rem;">Claire's Scheduling</span>
        </div>
        <h2 style="margin:0 0 12px;color:#1C1917;">Hey there!</h2>
        <p style="color:#44403C;line-height:1.6;margin:0 0 16px;">
          Just a friendly reminder that <strong>Claire</strong> is still waiting on your
          weekly availability for <strong>${groupName}</strong>.
        </p>
        <p style="color:#44403C;line-height:1.6;margin:0 0 24px;">
          It only takes a minute to fill out your free times, and it helps
          Claire find the best meeting window for everyone.
        </p>
        <a href="${link}"
          style="display:inline-block;background:#F59E0B;color:#fff;padding:13px 28px;
                 border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem;">
          Fill Out My Availability
        </a>
        <p style="margin-top:28px;font-size:0.8rem;color:#A8A29E;">
          Sent via Claire's Scheduling. You received this because someone added your email
          to a scheduling group.
        </p>
      </div>`;

    const raw = buildGmailRaw(email, `Reminder: fill out your availability for ${currentGroup.name}`, html);
    try {
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      });
      if (res.ok) {
        sent++;
      } else {
        const err = await res.json();
        if (err.error?.code === 403 || err.error?.code === 401) {
          showToast('Google permission needed — please reconnect Google and try again.', 'error');
          clearGoogleToken(); setGoogleDisconnected();
          break;
        }
        failed++;
      }
    } catch { failed++; }
  }

  btn.disabled = false;
  btn.textContent = 'Send Nudge';
  if (sent)   showToast(`Nudge sent to ${sent} person${sent !== 1 ? 's' : ''}!`, 'success');
  if (failed) showToast(`${failed} email${failed !== 1 ? 's' : ''} failed to send.`, 'error');
}

// ── Export to Google Sheets ───────────────────────────────

// Convert a slot array to readable time ranges e.g. "9:00 AM - 12:00 PM, 2:00 PM - 5:00 PM"
function slotsToTimeRanges(slots) {
  if (!slots || !slots.length) return 'Not available';
  const sorted = [...slots].sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0], prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) { prev = sorted[i]; continue; }
    ranges.push(`${slotToTime(start)} - ${slotToTime(prev + 1)}`);
    start = prev = sorted[i];
  }
  ranges.push(`${slotToTime(start)} - ${slotToTime(prev + 1)}`);
  return ranges.join(', ');
}

// Sheets API helpers
function sheetFmtReq(sheetId, r1, c1, r2, c2, fmt) {
  return { repeatCell: {
    range: { sheetId, startRowIndex: r1, endRowIndex: r2, startColumnIndex: c1, endColumnIndex: c2 },
    cell: { userEnteredFormat: fmt },
    fields: 'userEnteredFormat',
  }};
}
function sheetMergeReq(sheetId, r1, c1, r2, c2) {
  return { mergeCells: {
    range: { sheetId, startRowIndex: r1, endRowIndex: r2, startColumnIndex: c1, endColumnIndex: c2 },
    mergeType: 'MERGE_ALL',
  }};
}
function sheetColWidthReq(sheetId, col, width) {
  return { updateDimensionProperties: {
    range: { sheetId, dimension: 'COLUMNS', startIndex: col, endIndex: col + 1 },
    properties: { pixelSize: width }, fields: 'pixelSize',
  }};
}
function sheetFreezeReq(sheetId, rows, cols) {
  return { updateSheetProperties: {
    properties: { sheetId, gridProperties: { frozenRowCount: rows, frozenColumnCount: cols } },
    fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount',
  }};
}
function heatRgb(intensity) {
  if (intensity >= 1)    return { red: 0.18, green: 0.8,  blue: 0.44 }; // green  - all free
  if (intensity >= 0.75) return { red: 0.55, green: 0.87, blue: 0.35 }; // lime   - most free
  if (intensity >= 0.5)  return { red: 0.98, green: 0.88, blue: 0.30 }; // yellow - half free
  return                         { red: 0.98, green: 0.73, blue: 0.01 }; // amber  - few free
}

async function exportToSheets() {
  const token = getGoogleToken();
  if (!token) { showToast('Connect Google Calendar/Sheets first.', 'error'); requestGoogleToken(); return; }
  const members = getMembersInAdminTz();
  if (!members.length) { showToast('No members to export.', 'error'); return; }

  showToast('Building spreadsheet...', 'info');

  const AMBER  = { red: 0.96, green: 0.62, blue: 0.04 };
  const DARK   = { red: 0.13, green: 0.13, blue: 0.13 };
  const DARK2  = { red: 0.22, green: 0.22, blue: 0.22 };
  const WHITE  = { red: 1, green: 1, blue: 1 };
  const PALE   = { red: 1,    green: 0.98, blue: 0.93 };
  const adminTz = getAdminTimezone().split('/').pop().replace(/_/g,' ');
  const exported = new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });

  try {
    // ── 1. Create spreadsheet with 3 sheets ──────────────
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: { title: `${currentGroup.name} - Availability` },
        sheets: [
          { properties: { sheetId: 10, title: 'Individual',  index: 0 } },
          { properties: { sheetId: 20, title: 'Heatmap',     index: 1 } },
          { properties: { sheetId: 30, title: 'Best Times',  index: 2 } },
        ],
      }),
    });
    const created = await createRes.json();
    if (!createRes.ok) throw new Error(created.error?.message || 'Failed to create spreadsheet.');
    const sid = created.spreadsheetId;

    // ── 2. Build data arrays ──────────────────────────────

    // Individual sheet: one row per member, free time ranges per day
    const indivRows = [
      [`${currentGroup.name} - Availability`, ...Array(8).fill('')],
      [`Exported ${exported}  |  Times in ${adminTz}`, ...Array(8).fill('')],
      Array(9).fill(''),
      ['Name', 'Email', ...DAYS],
      ...members.map(m => [
        m.name, m.email,
        ...DAYS.map((_, d) => slotsToTimeRanges(m.availability?.[d] || [])),
      ]),
    ];

    // Heatmap sheet
    const total  = members.length;
    const matrix = Array.from({ length: 7 }, () => new Array(TOTAL_SLOTS).fill(0));
    for (const m of members) {
      for (let d = 0; d < 7; d++) {
        for (const s of (m.availability?.[d] || [])) { if (s < TOTAL_SLOTS) matrix[d][s]++; }
      }
    }
    const heatRows = [
      [`${currentGroup.name} - Availability Heatmap`, ...Array(7).fill('')],
      [`${total} member${total!==1?'s':''} | Exported ${exported} | ${adminTz}`, ...Array(7).fill('')],
      Array(8).fill(''),
      ['Time', ...DAYS_SHORT],
      ...Array.from({ length: TOTAL_SLOTS }, (_, s) => [
        slotToTime(s),
        ...DAYS_SHORT.map((__, d) => matrix[d][s] > 0 ? `${matrix[d][s]}/${total}` : ''),
      ]),
    ];

    // Best Times sheet
    const recs = getRecommendedTimes(members);
    const bestRows = [
      [`${currentGroup.name} - Best Meeting Times`, '', '', '', ''],
      [`Top windows | Exported ${exported}`, '', '', '', ''],
      ['', '', '', '', ''],
      ['Rank', 'Day', 'Time', 'Available', 'Who is free'],
      ...recs.slice(0, 15).map((r, i) => {
        const free = members
          .filter(m => (m.availability?.[r.day] || []).includes(r.startSlot))
          .map(m => m.name).join(', ');
        return [
          i + 1,
          DAYS[r.day],
          slotRangeLabel(r.startSlot, r.endSlot),
          `${r.count}/${r.total} (${Math.round(r.count / r.total * 100)}%)`,
          free,
        ];
      }),
    ];

    // ── 3. Write all values ───────────────────────────────
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}/values:batchUpdate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: [
          { range: 'Individual!A1',  values: indivRows },
          { range: 'Heatmap!A1',     values: heatRows  },
          { range: "'Best Times'!A1", values: bestRows  },
        ],
      }),
    });

    // ── 4. Format all sheets ──────────────────────────────
    const fmtReqs = [];
    const boldWhite  = { bold: true, foregroundColor: WHITE };
    const italGrey   = { italic: true, foregroundColor: { red:0.75,green:0.75,blue:0.75 } };

    // ---- Individual sheet ----
    const IND = 10, HEAT = 20, BEST = 30;
    const indivCols = 9;
    // Title row
    fmtReqs.push(sheetMergeReq(IND, 0, 0, 1, indivCols));
    fmtReqs.push(sheetFmtReq(IND, 0, 0, 1, indivCols, {
      backgroundColor: DARK,
      textFormat: { ...boldWhite, fontSize: 13 },
      verticalAlignment: 'MIDDLE', horizontalAlignment: 'LEFT',
    }));
    // Subtitle
    fmtReqs.push(sheetMergeReq(IND, 1, 0, 2, indivCols));
    fmtReqs.push(sheetFmtReq(IND, 1, 0, 2, indivCols, {
      backgroundColor: DARK2, textFormat: italGrey,
    }));
    // Header row (row index 3)
    fmtReqs.push(sheetFmtReq(IND, 3, 0, 4, indivCols, {
      backgroundColor: AMBER, textFormat: boldWhite,
      horizontalAlignment: 'CENTER',
    }));
    // Data rows alternating
    members.forEach((_, i) => {
      fmtReqs.push(sheetFmtReq(IND, 4+i, 0, 5+i, indivCols, {
        backgroundColor: i%2===0 ? PALE : WHITE,
        wrapStrategy: 'WRAP',
      }));
    });
    // Freeze header, set col widths
    fmtReqs.push(sheetFreezeReq(IND, 4, 1));
    fmtReqs.push(sheetColWidthReq(IND, 0, 150)); // Name
    fmtReqs.push(sheetColWidthReq(IND, 1, 200)); // Email
    for (let c = 2; c < 9; c++) fmtReqs.push(sheetColWidthReq(IND, c, 190)); // Days

    // ---- Heatmap sheet ----
    const heatCols = 8;
    fmtReqs.push(sheetMergeReq(HEAT, 0, 0, 1, heatCols));
    fmtReqs.push(sheetFmtReq(HEAT, 0, 0, 1, heatCols, {
      backgroundColor: DARK, textFormat: { ...boldWhite, fontSize: 13 },
      horizontalAlignment: 'LEFT',
    }));
    fmtReqs.push(sheetMergeReq(HEAT, 1, 0, 2, heatCols));
    fmtReqs.push(sheetFmtReq(HEAT, 1, 0, 2, heatCols, {
      backgroundColor: DARK2, textFormat: italGrey,
    }));
    fmtReqs.push(sheetFmtReq(HEAT, 3, 0, 4, heatCols, {
      backgroundColor: AMBER, textFormat: boldWhite,
      horizontalAlignment: 'CENTER',
    }));
    // Time label column
    fmtReqs.push(sheetFmtReq(HEAT, 4, 0, 4+TOTAL_SLOTS, 1, {
      textFormat: { bold: true }, horizontalAlignment: 'RIGHT',
    }));
    // Color cells by intensity
    for (let s = 0; s < TOTAL_SLOTS; s++) {
      for (let d = 0; d < 7; d++) {
        const count = matrix[d][s];
        if (count === 0) continue;
        fmtReqs.push(sheetFmtReq(HEAT, 4+s, 1+d, 5+s, 2+d, {
          backgroundColor: heatRgb(count/total),
          horizontalAlignment: 'CENTER',
          textFormat: { bold: count === total },
        }));
      }
    }
    fmtReqs.push(sheetFreezeReq(HEAT, 4, 1));
    fmtReqs.push(sheetColWidthReq(HEAT, 0, 95));
    for (let c = 1; c < 8; c++) fmtReqs.push(sheetColWidthReq(HEAT, c, 72));

    // ---- Best Times sheet ----
    fmtReqs.push(sheetMergeReq(BEST, 0, 0, 1, 5));
    fmtReqs.push(sheetFmtReq(BEST, 0, 0, 1, 5, {
      backgroundColor: DARK, textFormat: { ...boldWhite, fontSize: 13 },
    }));
    fmtReqs.push(sheetMergeReq(BEST, 1, 0, 2, 5));
    fmtReqs.push(sheetFmtReq(BEST, 1, 0, 2, 5, {
      backgroundColor: DARK2, textFormat: italGrey,
    }));
    fmtReqs.push(sheetFmtReq(BEST, 3, 0, 4, 5, {
      backgroundColor: AMBER, textFormat: boldWhite,
      horizontalAlignment: 'CENTER',
    }));
    recs.slice(0, 15).forEach((r, i) => {
      const rowBg = r.allAvailable
        ? { red:0.18,green:0.96,blue:0.53 }
        : i%2===0 ? PALE : WHITE;
      fmtReqs.push(sheetFmtReq(BEST, 4+i, 0, 5+i, 5, { backgroundColor: rowBg }));
    });
    fmtReqs.push(sheetFreezeReq(BEST, 4, 0));
    fmtReqs.push(sheetColWidthReq(BEST, 0, 55));
    fmtReqs.push(sheetColWidthReq(BEST, 1, 110));
    fmtReqs.push(sheetColWidthReq(BEST, 2, 150));
    fmtReqs.push(sheetColWidthReq(BEST, 3, 120));
    fmtReqs.push(sheetColWidthReq(BEST, 4, 300));

    // Send all format requests
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}:batchUpdate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: fmtReqs }),
    });

    window.open(`https://docs.google.com/spreadsheets/d/${sid}`, '_blank');
    showToast('Spreadsheet ready! Opening now.', 'success');
  } catch (e) {
    showToast(`Export failed: ${e.message}`, 'error');
  }
}

// ── Contacts ──────────────────────────────────────────────
let contactGroups = [];
let editingContactGroupId = null;

async function loadContactGroups() {
  show('contactGroupsLoading'); hide('contactGroupsGrid'); hide('contactGroupsEmpty');
  try {
    const res = await fetch(`/api/contacts?adminCode=${encodeURIComponent(getAdminCode())}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load contacts.');
    contactGroups = data || [];
  } catch (e) {
    showToast(e.message, 'error');
    contactGroups = [];
  }
  hide('contactGroupsLoading');
  renderContactGroupCards();
}

function renderContactGroupCards() {
  const grid = document.getElementById('contactGroupsGrid');
  if (!contactGroups.length) { show('contactGroupsEmpty'); hide('contactGroupsGrid'); return; }
  hide('contactGroupsEmpty'); show('contactGroupsGrid');

  grid.innerHTML = contactGroups.map(cg => {
    const members = cg.members || [];
    const count = members.length;
    const cgId = `cg-drop-${cg.id}`;
    // Sort alphabetically for display but keep original index for deletion
    const sorted = members
      .map((m, idx) => ({ m, idx }))
      .sort((a, b) => a.m.name.localeCompare(b.m.name));
    const memberRows = sorted.length
      ? sorted.map(({ m, idx }) => `
          <div class="contact-card-member-row">
            <span class="contact-card-member-name">${escHtml(m.name)}</span>
            ${m.email ? `<span class="contact-card-member-email">${escHtml(m.email)}</span>` : ''}
            <button class="btn-icon btn-danger contact-card-remove" title="Remove ${escHtml(m.name)}"
              onclick="removeContactMember('${cg.id}', ${idx})">✕</button>
          </div>`).join('')
      : '<div style="color:var(--text-muted);font-size:0.82rem;padding:0.3rem 0;">No people yet</div>';

    return `
    <div class="group-card">
      <div class="group-card-name">${escHtml(cg.name)}</div>
      <div class="group-card-meta" style="margin-bottom:0.65rem;">
        <span class="badge badge-primary">${count} person${count !== 1 ? 's' : ''}</span>
      </div>
      <details class="contact-card-details" id="${cgId}">
        <summary class="contact-card-summary">Show people</summary>
        <div class="contact-card-member-list">${memberRows}</div>
      </details>
      <div class="group-card-actions" style="margin-top:0.75rem;">
        <button class="btn btn-primary btn-sm" onclick="openContactGroupModal(${JSON.stringify(cg).replace(/"/g,'&quot;')})">Edit</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteContactGroup('${cg.id}','${escHtml(cg.name)}')">Delete Group</button>
      </div>
    </div>`;
  }).join('');
}

async function removeContactMember(groupId, memberIdx) {
  const cg = contactGroups.find(c => c.id === groupId);
  if (!cg) return;
  const member = cg.members[memberIdx];
  const memberName = member?.name || 'this person';
  if (!confirm(`Remove ${memberName} from "${cg.name}"?`)) return;

  const newMembers = cg.members.filter((_, i) => i !== memberIdx);
  const res = await fetch('/api/contacts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: groupId, name: cg.name, members: newMembers, adminCode: getAdminCode() }),
  });
  if (!res.ok) { showToast('Failed to remove person.', 'error'); return; }
  showToast(`${memberName} removed.`, 'success');
  await loadContactGroups();
  // Re-open the dropdown they were in
  const drop = document.getElementById(`cg-drop-${groupId}`);
  if (drop) drop.open = true;

  // Offer to also remove from any schedules' expected lists
  if (member) await offerRemoveFromSchedules(member);
}

async function offerRemoveFromSchedules(member) {
  // Fetch all schedules and check expected_members for this person
  const { data: groups, error } = await db
    .from('groups')
    .select('id, name, expected_members')
    .not('expected_members', 'is', null);
  if (error || !groups?.length) return;

  const memberEmail = member.email?.toLowerCase();
  const memberName  = member.name?.toLowerCase();

  const affected = groups.filter(g => {
    return (g.expected_members || []).some(e => {
      const parsed = parseExpectedEntry(e);
      if (memberEmail && parsed.email && parsed.email === memberEmail) return true;
      if (memberName  && parsed.name  && parsed.name.toLowerCase() === memberName) return true;
      return false;
    });
  });

  if (!affected.length) return;

  const names = affected.map(g => `"${g.name}"`).join(', ');
  const doRemove = confirm(
    `${member.name} also appears in the expected list for ${names}.\nRemove them from those schedule(s) too?`
  );
  if (!doRemove) return;

  for (const g of affected) {
    const updated = (g.expected_members || []).filter(e => {
      const parsed = parseExpectedEntry(e);
      if (memberEmail && parsed.email && parsed.email === memberEmail) return false;
      if (memberName  && parsed.name  && parsed.name.toLowerCase() === memberName) return false;
      return true;
    });
    await fetch('/api/update-group', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: g.id, expectedMembers: updated, adminCode: getAdminCode() }),
    });
  }
  showToast(`Removed from ${affected.length} schedule${affected.length !== 1 ? 's' : ''}.`, 'success');
  // Refresh current group detail if it was one of the affected
  if (currentGroup && affected.some(g => g.id === currentGroup.id)) {
    const updatedGroup = affected.find(g => g.id === currentGroup.id);
    if (updatedGroup) {
      currentGroup.expected_members = (updatedGroup.expected_members || []).filter(e => {
        const parsed = parseExpectedEntry(e);
        if (memberEmail && parsed.email && parsed.email === memberEmail) return false;
        if (memberName  && parsed.name  && parsed.name.toLowerCase() === memberName) return false;
        return true;
      });
      renderMembers();
    }
  }
}

function openContactGroupModal(group) {
  editingContactGroupId = group?.id || null;
  document.getElementById('contactGroupModalTitle').textContent = group ? 'Edit Contact Group' : 'New Contact Group';
  document.getElementById('contactGroupName').value = group?.name || '';
  document.getElementById('contactGroupError').classList.add('hidden');

  const rows = document.getElementById('contactMemberRows');
  rows.innerHTML = '';
  const members = group?.members || [];
  if (members.length) {
    members.forEach(m => addContactMemberRow(m.name, m.email));
  } else {
    addContactMemberRow();
  }
  show('contactGroupModal');
  document.getElementById('contactGroupName').focus();
}

function closeContactGroupModal() {
  hide('contactGroupModal');
  editingContactGroupId = null;
}

function toggleImportBox() {
  const box = document.getElementById('importBox');
  const isHidden = box.classList.contains('hidden');
  box.classList.toggle('hidden', !isHidden);
  if (isHidden) {
    document.getElementById('importPasteArea').value = '';
    document.getElementById('importFeedback').textContent = '';
    document.getElementById('importPasteArea').focus();
  }
}

function runImport() {
  const raw = document.getElementById('importPasteArea').value.trim();
  if (!raw) return;

  // Collect existing emails to skip duplicates
  const existingEmails = new Set(
    [...document.querySelectorAll('.contact-member-email')]
      .map(i => i.value.trim().toLowerCase()).filter(Boolean)
  );

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  let added = 0;

  for (const line of lines) {
    // Split on tab (Google Sheets copy-paste) or comma
    const parts = line.includes('\t')
      ? line.split('\t').map(p => p.trim())
      : line.split(',').map(p => p.trim());

    let name = '', email = '';

    for (const part of parts) {
      const clean = part.replace(/^["']|["']$/g, '');
      if (clean.includes('@')) {
        if (!email) email = clean;
      } else if (clean) {
        if (!name) name = clean;
      }
    }

    // Single part with no @ is a name only
    if (parts.length === 1 && !parts[0].includes('@')) {
      name = parts[0].replace(/^["']|["']$/g, '');
      email = '';
    }

    if (!name && !email) continue;
    if (email && existingEmails.has(email.toLowerCase())) continue;

    addContactMemberRow(name, email);
    if (email) existingEmails.add(email.toLowerCase());
    added++;
  }

  document.getElementById('importFeedback').textContent =
    added > 0 ? `${added} person${added !== 1 ? 's' : ''} added!` : 'Nothing new to add.';
  document.getElementById('importPasteArea').value = '';
}

function addContactMemberRow(name = '', email = '') {
  const rows = document.getElementById('contactMemberRows');
  const row = document.createElement('div');
  row.className = 'contact-member-row';
  row.innerHTML = `
    <input type="text" class="contact-member-name" placeholder="Name" value="${escHtml(name)}" />
    <input type="email" class="contact-member-email" placeholder="Email (optional)" value="${escHtml(email)}" />
    <button class="btn-icon btn-danger contact-member-remove" title="Remove">✕</button>`;
  row.querySelector('.contact-member-remove').addEventListener('click', () => row.remove());
  rows.appendChild(row);
}

async function saveContactGroup() {
  const name = document.getElementById('contactGroupName').value.trim();
  const errEl = document.getElementById('contactGroupError');
  errEl.classList.add('hidden');

  if (!name) { errEl.textContent = 'Please enter a group name.'; errEl.classList.remove('hidden'); return; }

  const members = [...document.querySelectorAll('.contact-member-row')].map(row => ({
    name:  row.querySelector('.contact-member-name').value.trim(),
    email: row.querySelector('.contact-member-email').value.trim(),
  })).filter(m => m.name);

  const btn = document.getElementById('confirmContactGroup');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    const method = editingContactGroupId ? 'PUT' : 'POST';
    const body = { name, members, adminCode: getAdminCode() };
    if (editingContactGroupId) body.id = editingContactGroupId;

    const res = await fetch('/api/contacts', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save.');

    closeContactGroupModal();
    showToast(`"${name}" saved!`, 'success');
    await loadContactGroups();
  } catch (e) {
    errEl.textContent = e.message; errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Group';
  }
}

async function deleteContactGroup(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  const res = await fetch('/api/contacts', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, adminCode: getAdminCode() }),
  });
  if (!res.ok) { showToast('Failed to delete.', 'error'); return; }
  showToast(`"${name}" deleted.`, 'success');
  await loadContactGroups();
}

// ── Contact search (Contacts tab) ─────────────────────────
function filterContacts(query) {
  const resultsEl = document.getElementById('contactSearchResults');
  const gridEl    = document.getElementById('contactGroupsGrid');
  const emptyEl   = document.getElementById('contactGroupsEmpty');

  if (!query.trim()) {
    resultsEl.classList.add('hidden');
    resultsEl.innerHTML = '';
    // Restore normal grid / empty state
    if (contactGroups.length) {
      gridEl.classList.remove('hidden');
      emptyEl.classList.add('hidden');
    } else {
      gridEl.classList.add('hidden');
      emptyEl.classList.remove('hidden');
    }
    return;
  }

  // While searching, hide normal grid
  gridEl.classList.add('hidden');
  emptyEl.classList.add('hidden');
  resultsEl.classList.remove('hidden');

  const q = query.trim().toLowerCase();
  const hits = [];
  for (const cg of contactGroups) {
    for (const m of (cg.members || [])) {
      const nameMatch  = m.name?.toLowerCase().includes(q);
      const emailMatch = m.email?.toLowerCase().includes(q);
      if (nameMatch || emailMatch) {
        hits.push({ m, groupName: cg.name });
      }
    }
  }

  if (!hits.length) {
    resultsEl.innerHTML = '<p class="text-muted" style="font-size:0.85rem;padding:0.5rem 0;">No people match your search.</p>';
    return;
  }

  resultsEl.innerHTML = hits.map(({ m, groupName }) => `
    <div class="pending-item" style="background:var(--surface-alt,#f9f9f9);border-radius:10px;padding:0.6rem 0.9rem;margin-bottom:0.5rem;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:0.875rem;">${escHtml(m.name)}</div>
        ${m.email ? `<div style="font-size:0.78rem;color:var(--text-muted);">${escHtml(m.email)}</div>` : ''}
      </div>
      <span class="badge badge-primary" style="font-size:0.72rem;flex-shrink:0;">${escHtml(groupName)}</span>
    </div>`).join('');
}

// ── Edit schedule ──────────────────────────────────────────
function openEditScheduleModal(group) {
  if (group) currentGroup = group;
  if (!currentGroup) return;
  document.getElementById('editScheduleName').value    = currentGroup.name || '';
  document.getElementById('editScheduleDesc').value    = currentGroup.description || '';
  document.getElementById('editScheduleExpected').value =
    (currentGroup.expected_members || []).join('\n');
  document.getElementById('editScheduleError').classList.add('hidden');
  // Reset picker collapse state
  const details = document.getElementById('editAddFromContactsDetails');
  if (details) details.open = false;
  // Populate scheduling mode
  editGroupMode  = currentGroup.schedule_mode || 'weekly';
  editGroupDates = Array.isArray(currentGroup.date_window) ? [...currentGroup.date_window] : [];
  editSetMode(editGroupMode);
  loadContactsForEditPicker();
  document.getElementById('editScheduleModal').classList.remove('hidden');
  document.getElementById('editScheduleName').focus();
}

async function loadContactsForEditPicker() {
  const pickerEl = document.getElementById('editContactPickerList');
  if (!pickerEl) return;
  pickerEl.innerHTML = '<p class="text-muted" style="font-size:0.8rem;">Loading contacts...</p>';
  try {
    const res = await fetch(`/api/contacts?adminCode=${encodeURIComponent(getAdminCode())}`);
    const data = await res.json();
    if (!res.ok || !data.length) {
      pickerEl.innerHTML = '<p class="text-muted" style="font-size:0.8rem;">No contacts yet. Add some in the Contacts tab.</p>';
      return;
    }
    contactGroups = data;
    const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
    pickerEl.innerHTML = sorted.map((cg, i) => {
      const groupId = `ecpg-${i}`;
      const membersSorted = [...(cg.members || [])].sort((a, b) => a.name.localeCompare(b.name));
      return `
      <div class="contact-picker-group">
        <button type="button" class="contact-picker-group-header" onclick="togglePickerGroup('${groupId}')">
          <span class="contact-picker-group-name">${escHtml(cg.name)}</span>
          <span class="contact-picker-group-meta">${membersSorted.length} person${membersSorted.length !== 1 ? 's' : ''}</span>
          <span class="contact-picker-chevron" id="${groupId}-chevron">▸</span>
        </button>
        <div class="contact-picker-group-body hidden" id="${groupId}">
          ${membersSorted.map(m => `
            <label class="contact-picker-item">
              <input type="checkbox"
                data-name="${escHtml(m.name)}"
                data-email="${escHtml(m.email || '')}"
                onchange="syncEditContactsToExpected()" />
              <span class="contact-picker-name">${escHtml(m.name)}</span>
              ${m.email ? `<span class="contact-picker-email">${escHtml(m.email)}</span>` : ''}
            </label>`).join('')}
        </div>
      </div>`;
    }).join('');
  } catch {
    pickerEl.innerHTML = '<p class="text-muted" style="font-size:0.8rem;">Could not load contacts.</p>';
  }
}

function syncEditContactsToExpected() {
  const textarea = document.getElementById('editScheduleExpected');

  const entryFor = cb => {
    const n = cb.dataset.name, e = cb.dataset.email;
    if (n && e) return `${n} <${e}>`;
    return e || n;
  };

  const allContactEntries = new Set(
    [...document.querySelectorAll('#editContactPickerList input[type="checkbox"]')].map(entryFor)
  );
  const checkedEntries = [...document.querySelectorAll('#editContactPickerList input[type="checkbox"]:checked')]
    .map(entryFor);

  const manualLines = textarea.value.split('\n')
    .map(s => s.trim())
    .filter(s => s && !allContactEntries.has(s));

  textarea.value = [...manualLines, ...checkedEntries].join('\n');
}

function closeEditScheduleModal() {
  document.getElementById('editScheduleModal').classList.add('hidden');
}

async function saveScheduleEdits() {
  const name        = document.getElementById('editScheduleName').value.trim();
  const description = document.getElementById('editScheduleDesc').value.trim();
  const expected    = document.getElementById('editScheduleExpected').value
    .split('\n').map(s => s.trim()).filter(Boolean);
  const errEl = document.getElementById('editScheduleError');
  errEl.classList.add('hidden');

  if (!name) { errEl.textContent = 'Schedule name is required.'; errEl.classList.remove('hidden'); return; }

  const btn = document.getElementById('confirmEditSchedule');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    const res = await fetch('/api/update-group', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: currentGroup.id,
        name,
        description,
        expectedMembers: expected,
        adminCode: getAdminCode(),
        schedule_mode: editGroupMode,
        date_window: editGroupDates,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save changes.');

    // Update local state
    currentGroup = { ...currentGroup, name, description, expected_members: expected, schedule_mode: editGroupMode, date_window: editGroupDates };
    closeEditScheduleModal();
    showToast('Schedule updated!', 'success');
    // If we're in detail view, update header + pending section
    const detailVisible = !document.getElementById('groupDetailView').classList.contains('hidden');
    if (detailVisible) {
      document.getElementById('detailGroupName').textContent = name;
      renderMembers();
    } else {
      // Edited from card — refresh the grid
      await loadGroups();
    }
  } catch (e) {
    errEl.textContent = e.message; errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Changes';
  }
}

// ── Contact picker (in Create Schedule modal) ─────────────
async function loadContactsForPicker() {
  const pickerEl = document.getElementById('contactPickerList');
  pickerEl.innerHTML = '<p class="text-muted" style="font-size:0.8rem;">Loading contacts...</p>';
  try {
    const res = await fetch(`/api/contacts?adminCode=${encodeURIComponent(getAdminCode())}`);
    const data = await res.json();
    if (!res.ok || !data.length) {
      pickerEl.innerHTML = '<p class="text-muted" style="font-size:0.8rem;">No contacts yet. Add some in the Contacts tab.</p>';
      return;
    }
    contactGroups = data; // keep cache in sync
    const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
    pickerEl.innerHTML = sorted.map((cg, i) => {
      const groupId = `cpg-${i}`;
      const membersSorted = [...(cg.members || [])].sort((a, b) => a.name.localeCompare(b.name));
      return `
      <div class="contact-picker-group">
        <button type="button" class="contact-picker-group-header" onclick="togglePickerGroup('${groupId}')">
          <span class="contact-picker-group-name">${escHtml(cg.name)}</span>
          <span class="contact-picker-group-meta">${membersSorted.length} person${membersSorted.length !== 1 ? 's' : ''}</span>
          <span class="contact-picker-chevron" id="${groupId}-chevron">▸</span>
        </button>
        <div class="contact-picker-group-body hidden" id="${groupId}">
          ${membersSorted.map(m => `
            <label class="contact-picker-item">
              <input type="checkbox"
                data-name="${escHtml(m.name)}"
                data-email="${escHtml(m.email || '')}"
                onchange="syncContactsToExpected()" />
              <span class="contact-picker-name">${escHtml(m.name)}</span>
              ${m.email ? `<span class="contact-picker-email">${escHtml(m.email)}</span>` : ''}
            </label>`).join('')}
        </div>
      </div>`;
    }).join('');
  } catch {
    pickerEl.innerHTML = '<p class="text-muted" style="font-size:0.8rem;">Could not load contacts.</p>';
  }
}

function togglePickerGroup(groupId) {
  const body    = document.getElementById(groupId);
  const chevron = document.getElementById(`${groupId}-chevron`);
  const isHidden = body.classList.contains('hidden');
  body.classList.toggle('hidden', !isHidden);
  chevron.textContent = isHidden ? '▾' : '▸';
}

function syncContactsToExpected() {
  const textarea = document.getElementById('newGroupExpected');

  // Build the full formatted entry for each contact checkbox
  const entryFor = cb => {
    const n = cb.dataset.name, e = cb.dataset.email;
    if (n && e) return `${n} <${e}>`;
    return e || n;
  };

  const allContactEntries = new Set(
    [...document.querySelectorAll('#contactPickerList input[type="checkbox"]')].map(entryFor)
  );
  const checkedEntries = [...document.querySelectorAll('#contactPickerList input[type="checkbox"]:checked')]
    .map(entryFor);

  // Keep manually typed lines, replace contact-sourced lines
  const manualLines = textarea.value.split('\n')
    .map(s => s.trim())
    .filter(s => s && !allContactEntries.has(s));

  textarea.value = [...manualLines, ...checkedEntries].join('\n');
}

// show/hide/escHtml defined in utils.js

// ── Notes Import (text paste) ─────────────────────────────
let importParsedTasks = [];
let importStep = 1; // 1 = paste, 2 = preview

// ── Notes text parsing ────────────────────────────────────
function _importFolderOptionsHtml() {
  return '<option value="">No folder</option>' +
    (allTaskLists || []).map(l => `<option value="${l.id}">${escHtml(l.name)}</option>`).join('');
}

function findContactByName(name) {
  const q = name.trim().toLowerCase();
  for (const g of (contactGroups || [])) {
    for (const m of (g.members || [])) {
      if ((m.name || '').toLowerCase() === q) return m;
      // First-name + last-name partial match
      const parts = (m.name || '').toLowerCase().split(/\s+/);
      const qparts = q.split(/\s+/);
      if (qparts.length >= 2 && parts[0] === qparts[0] && parts[parts.length - 1] === qparts[qparts.length - 1]) return m;
    }
  }
  return null;
}

function _extractNamesAndTitle(line) {
  // Handle "Name1 & Name2 task..." or "Name1& Name2 task..."
  const multiRe = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*&\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(.+)/;
  const multi = line.match(multiRe);
  if (multi) return { names: [multi[1].trim(), multi[2].trim()], title: multi[3].trim() };

  // Single "First Last task..."
  const single = line.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(.+)/);
  if (single) return { names: [single[1].trim()], title: single[2].trim() };

  return { names: [], title: line.trim() };
}

function parseNotesText(text) {
  const lines = text.split('\n');
  const tasks = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    // Indented line = sub-note for last task
    if (/^\s/.test(line)) {
      if (tasks.length) tasks[tasks.length - 1].notes.push(line.trim());
      continue;
    }

    const trimmed = line.trim();

    // @ALL broadcast — treat whole line as task, no specific assignee
    if (trimmed.startsWith('@')) {
      const title = trimmed.replace(/^@[^:]+:\s*/, '').trim() || trimmed;
      tasks.push({ names: [], resolvedAssignees: [], title, notes: [], selected: true, list_id: null, deadline: null, deadline_time: null });
      continue;
    }

    // Section header lines like "Producers:" or "Post Production:" (no task pattern match)
    const { names, title } = _extractNamesAndTitle(trimmed);
    if (!title || (!names.length && /^[A-Z][^a-z]/.test(trimmed) && trimmed.endsWith(':'))) continue;

    // Resolve names → contacts
    const resolvedAssignees = [];
    const unresolvedNames = [];
    for (const name of names) {
      const contact = findContactByName(name);
      if (contact) {
        resolvedAssignees.push({ name: contact.name, email: contact.email });
      } else {
        unresolvedNames.push(name);
      }
    }

    tasks.push({ names, resolvedAssignees, unresolvedNames, title, notes: [], selected: true, list_id: null, deadline: null, deadline_time: null });
  }
  return tasks;
}

// ── Import modal open/close/navigate ─────────────────────
function openImportNotesModal() {
  importStep = 1;
  importParsedTasks = [];
  document.getElementById('importNotesInput').value = '';
  hide('importParseError');
  hide('importStep2');
  show('importStep1');
  document.getElementById('importBackBtn').style.display = 'none';
  document.getElementById('importActionBtn').textContent = 'Parse Notes →';
  document.getElementById('importModalTitle').textContent = 'Import Notes';
  hide('importError');
  show('notesImportModal');
  setTimeout(() => document.getElementById('importNotesInput').focus(), 50);
}

function closeImportNotesModal() {
  hide('notesImportModal');
  importParsedTasks = [];
}

function importGoBack() {
  importStep = 1;
  show('importStep1');
  hide('importStep2');
  document.getElementById('importBackBtn').style.display = 'none';
  document.getElementById('importActionBtn').textContent = 'Parse Notes →';
  document.getElementById('importModalTitle').textContent = 'Import Notes';
}

function importAction() {
  if (importStep === 1) {
    _importParse();
  } else {
    _importConfirm();
  }
}

async function _importParse() {
  const text = document.getElementById('importNotesInput').value.trim();
  if (!text) {
    document.getElementById('importParseError').textContent = 'Paste some notes first.';
    show('importParseError');
    return;
  }
  hide('importParseError');

  if (!contactGroups.length) await ensureContactsLoaded();
  importParsedTasks = parseNotesText(text);
  if (!importParsedTasks.length) {
    document.getElementById('importParseError').textContent = 'No tasks found. Check the format.';
    show('importParseError');
    return;
  }

  // Populate bulk folder select
  const bulk = document.getElementById('importBulkFolder');
  bulk.innerHTML = '<option value="">— keep individual —</option><option value="__none__">No folder</option>' +
    (allTaskLists || []).map(l => `<option value="${l.id}">${escHtml(l.name)}</option>`).join('');

  // Show unmatched name warning
  const unresolved = importParsedTasks.flatMap(t => t.unresolvedNames || []);
  const uniqueUnresolved = [...new Set(unresolved)];
  const warnEl = document.getElementById('importUnmatchedWarn');
  if (uniqueUnresolved.length) {
    warnEl.textContent = `These names weren't found in contacts and will be skipped: ${uniqueUnresolved.join(', ')}`;
    show('importUnmatchedWarn');
  } else {
    hide('importUnmatchedWarn');
  }

  renderImportPreview();

  importStep = 2;
  hide('importStep1');
  show('importStep2');
  document.getElementById('importBackBtn').style.display = '';
  document.getElementById('importActionBtn').textContent = 'Import Tasks';
  document.getElementById('importModalTitle').textContent = `Review ${importParsedTasks.length} Tasks`;
}

function renderImportPreview() {
  const selected = importParsedTasks.filter(t => t.selected).length;
  document.getElementById('importTaskCount').textContent =
    `${selected} of ${importParsedTasks.length} selected`;

  const folderOpts = _importFolderOptionsHtml();
  const list = document.getElementById('importPreviewList');

  list.innerHTML = importParsedTasks.map((t, i) => {
    const assigneeHtml = t.resolvedAssignees.length
      ? t.resolvedAssignees.map(a => `<span class="task-chip" style="font-size:0.75rem;">${escHtml(a.name || a.email)}</span>`).join('')
      : (t.names.length ? `<span style="font-size:0.75rem;color:var(--text-muted);font-style:italic;">${escHtml(t.names.join(', '))} (not in contacts)</span>` : '');
    const notesHtml = t.notes.length
      ? `<div class="import-task-notes">${t.notes.map(n => `• ${escHtml(n)}`).join('<br>')}</div>` : '';

    return `
      <div class="import-task-row ${t.selected ? '' : 'import-task-deselected'}">
        <input type="checkbox" ${t.selected ? 'checked' : ''}
          onchange="importParsedTasks[${i}].selected=this.checked;
            this.closest('.import-task-row').classList.toggle('import-task-deselected',!this.checked);
            document.getElementById('importTaskCount').textContent=(importParsedTasks.filter(x=>x.selected).length)+' of '+importParsedTasks.length+' selected';" />
        <div class="import-task-info" style="flex:1;min-width:0;">
          <div class="import-task-title">${escHtml(t.title)}</div>
          ${assigneeHtml ? `<div style="margin-top:0.2rem;display:flex;gap:0.25rem;flex-wrap:wrap;">${assigneeHtml}</div>` : ''}
          ${notesHtml}
          <div style="display:flex;gap:0.35rem;margin-top:0.35rem;flex-wrap:wrap;align-items:center;">
            <input type="date" value="${t.deadline || ''}"
              onchange="importParsedTasks[${i}].deadline=this.value||null"
              style="font-size:0.72rem;padding:0.15rem 0.3rem;border:1px solid var(--border);border-radius:5px;font-family:inherit;" />
            <input type="time" value="${t.deadline_time || ''}"
              onchange="importParsedTasks[${i}].deadline_time=this.value||null"
              style="font-size:0.72rem;padding:0.15rem 0.3rem;border:1px solid var(--border);border-radius:5px;font-family:inherit;" />
          </div>
        </div>
        <select class="import-folder-sel" onchange="importParsedTasks[${i}].list_id=this.value||null"
          style="font-size:0.75rem;padding:0.2rem 0.4rem;border:1px solid var(--border);border-radius:6px;font-family:inherit;flex-shrink:0;max-width:130px;">
          ${folderOpts}
        </select>
      </div>`;
  }).join('');
}

function importSelectAll(checked) {
  importParsedTasks.forEach(t => t.selected = checked);
  renderImportPreview();
}

function importSetAllFolders(val) {
  if (!val) return; // "— keep individual —"
  const folderId = val === '__none__' ? null : val;
  importParsedTasks.forEach(t => t.list_id = folderId);
  // Update all the per-row selects to match
  document.querySelectorAll('.import-folder-sel').forEach(sel => {
    sel.value = folderId || '';
  });
}

async function _importConfirm() {
  const selected = importParsedTasks.filter(t => t.selected);
  if (!selected.length) {
    document.getElementById('importError').textContent = 'Select at least one task.';
    show('importError');
    return;
  }
  hide('importError');

  const btn = document.getElementById('importActionBtn');
  btn.disabled = true;
  btn.textContent = 'Importing…';

  let failed = 0;
  for (const t of selected) {
    const description = t.notes.length ? t.notes.join('\n') : null;
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminCode: getAdminCode(),
        title: t.title,
        description,
        list_id: t.list_id || null,
        assignments: t.resolvedAssignees,
        deadline: t.deadline || null,
        deadline_time: t.deadline_time || null,
      }),
    });
    if (!res.ok) failed++;
  }

  btn.disabled = false;
  btn.textContent = 'Import Tasks';
  closeImportNotesModal();
  await loadTasks();

  if (failed) {
    showToast(`Imported ${selected.length - failed} tasks (${failed} failed).`, 'error');
  } else {
    showToast(`Imported ${selected.length} task${selected.length > 1 ? 's' : ''}.`, 'success');
  }
}
