// ─────────────────────────────────────────────────────────
//  CLAIRE : Admin dashboard (admin.html)
// ─────────────────────────────────────────────────────────

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
    return { ...m, availability: convertAvailability(m.availability, memberTz, adminTz) };
  });
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

  // Fade in columns left to right
  grid.querySelectorAll('.heatmap-cell').forEach(el => {
    const day = +el.dataset.day;
    el.style.animationDelay = `${day * 55}ms`;
    el.classList.add('heatmap-col-fadein');
    el.addEventListener('animationend', () => el.classList.remove('heatmap-col-fadein'), { once: true });
  });

  // Legend
  document.getElementById('heatmapLegend').innerHTML = `
    <div class="heatmap-legend-swatch" style="background:#F3F4F6"></div> None &nbsp;
    <div class="heatmap-legend-swatch" style="background:#FCD34D"></div> Some &nbsp;
    <div class="heatmap-legend-swatch" style="background:#F59E0B"></div> Most &nbsp;
    <div class="heatmap-legend-swatch" style="background:#22C55E"></div> All available`;
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
}

function closeSlotDetail() {
  document.getElementById('slotDetailModal').classList.add('hidden');
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

// ── Main view switcher (Schedules / Contacts) ─────────────
function switchMainView(view) {
  const isSchedules = view === 'schedules';
  document.getElementById('schedulesSection').classList.toggle('hidden', !isSchedules);
  document.getElementById('contactsSection').classList.toggle('hidden', isSchedules);
  document.getElementById('navSchedules').classList.toggle('active', isSchedules);
  document.getElementById('navContacts').classList.toggle('active', !isSchedules);
  if (!isSchedules) loadContactGroups();
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
}

function closeCreateModal() {
  hide('createGroupModal');
  document.getElementById('newGroupName').value = '';
  document.getElementById('newGroupDesc').value = '';
  document.getElementById('newGroupExpected').value = '';
  document.getElementById('newGroupSlug').value = '';
  document.getElementById('createGroupError').classList.add('hidden');
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
      body: JSON.stringify({ name, description: desc, expectedMembers: expected, customSlug: customSlug || undefined, adminCode: getAdminCode() }),
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
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save changes.');

    // Update local state
    currentGroup = { ...currentGroup, name, description, expected_members: expected };
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

// ── DOM helpers ───────────────────────────────────────────
function show(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id) { document.getElementById(id)?.classList.add('hidden'); }
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
