// ─────────────────────────────────────────────────────────
//  CLAIRE — Admin dashboard (admin.html)
// ─────────────────────────────────────────────────────────

let db, currentGroup, groupMembers = [], googleTokenClient;

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
    .select('*, members(count)')
    .order('created_at', { ascending: false });

  hide('groupsLoading');

  if (error) { showToast('Failed to load groups.', 'error'); return; }

  if (!data || data.length === 0) {
    show('groupsEmpty'); return;
  }

  renderGroupCards(data);
  show('groupsGrid');
}

function renderGroupCards(groups) {
  const grid = document.getElementById('groupsGrid');
  grid.innerHTML = groups.map(g => {
    const count = g.members?.[0]?.count ?? 0;
    const link  = groupLink(g.slug);
    return `
    <div class="group-card" data-group-id="${g.id}">
      <div class="group-card-name">${escHtml(g.name)}</div>
      <div class="group-card-meta">
        <span class="badge badge-primary">${count} member${count !== 1 ? 's' : ''}</span>
        &nbsp; Created ${relativeTime(g.created_at)}
      </div>
      <div class="group-card-actions">
        <button class="btn btn-primary btn-sm view-group-btn" data-group='${JSON.stringify(g)}'>View</button>
        <button class="btn btn-ghost btn-sm copy-link-btn" data-link="${link}">Copy Link</button>
        <button class="btn btn-ghost btn-sm delete-group-btn" data-group-id="${g.id}" data-group-name="${escHtml(g.name)}" title="Delete group">🗑</button>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.view-group-btn').forEach(btn =>
    btn.addEventListener('click', () => openGroupDetail(JSON.parse(btn.dataset.group)))
  );
  grid.querySelectorAll('.copy-link-btn').forEach(btn =>
    btn.addEventListener('click', () => copyToClipboard(btn.dataset.link, 'Link copied!'))
  );
  grid.querySelectorAll('.delete-group-btn').forEach(btn =>
    btn.addEventListener('click', () => confirmDeleteGroup(btn.dataset.groupId, btn.dataset.groupName))
  );
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
  switchTab('members');
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
    p.classList.toggle('hidden', p.id !== `tab-${tab}`);
  });

  if (tab === 'members')      renderMembers();
  if (tab === 'availability') renderHeatmap();
  if (tab === 'recommend')    renderRecommended();
}

// ── Members tab ───────────────────────────────────────────
function renderMembers() {
  const list = document.getElementById('membersList');
  const empty = document.getElementById('membersEmpty');

  if (!groupMembers.length) { list.innerHTML = ''; show('membersEmpty'); return; }
  hide('membersEmpty');

  list.innerHTML = groupMembers.map(m => `
    <div class="member-item">
      <div>
        <div class="member-name">${escHtml(m.name)}</div>
        <div class="member-email">${escHtml(m.email)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <span class="badge badge-success">✓ Submitted</span>
        <span class="member-submitted">${relativeTime(m.updated_at || m.created_at)}</span>
        <button class="btn-icon" title="Remove member"
          onclick="removeMember('${m.id}','${escHtml(m.name)}')">🗑</button>
      </div>
    </div>`).join('');
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
      html += `<div class="heatmap-cell" style="background:${bg}" title="${tip}"></div>`;
    }
  }

  grid.innerHTML = html;

  // Legend
  document.getElementById('heatmapLegend').innerHTML = `
    <div class="heatmap-legend-swatch" style="background:#F3F4F6"></div> None &nbsp;
    <div class="heatmap-legend-swatch" style="background:#FCD34D"></div> Some &nbsp;
    <div class="heatmap-legend-swatch" style="background:#F59E0B"></div> Most &nbsp;
    <div class="heatmap-legend-swatch" style="background:#22C55E"></div> All available`;
}

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

// ── Create group ──────────────────────────────────────────
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

  document.getElementById('createGroupBtn').addEventListener('click', () => {
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
}

function closeCreateModal() {
  hide('createGroupModal');
  document.getElementById('newGroupName').value = '';
  document.getElementById('newGroupDesc').value = '';
  document.getElementById('createGroupError').classList.add('hidden');
}

async function createGroup() {
  const name = document.getElementById('newGroupName').value.trim();
  const desc = document.getElementById('newGroupDesc').value.trim();
  const errEl = document.getElementById('createGroupError');
  errEl.classList.add('hidden');

  if (!name) { errEl.textContent = 'Please enter a group name.'; errEl.classList.remove('hidden'); return; }

  const btn = document.getElementById('confirmCreateGroup');
  btn.disabled = true; btn.textContent = 'Creating…';

  try {
    const res = await fetch('/api/create-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: desc, adminCode: getAdminCode() }),
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
          <div style="font-weight:600;">${DAYS[r.day]} — ${slotRangeLabel(r.startSlot, r.endSlot)}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);">
            ${r.allAvailable ? '🎉 Everyone available' : `${r.count}/${r.total} available`}
          </div>
        </div>
      </button>`).join('');

    // Set date/time from first rec
    if (selectedRec) prefillDateTimeFromRec(selectedRec);
  } else {
    optionsEl.innerHTML = '<p class="text-muted text-sm">No recommended times yet — you can still pick a custom time below.</p>';
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
      scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/spreadsheets',
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

// ── Export to Google Sheets ───────────────────────────────
async function exportToSheets() {
  const token = getGoogleToken();
  if (!token) {
    showToast('Connect Google Calendar/Sheets first.', 'error');
    requestGoogleToken();
    return;
  }
  if (!groupMembers.length) { showToast('No members to export.', 'error'); return; }

  showToast('Creating spreadsheet…', 'info');

  try {
    // Create spreadsheet
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { title: `${currentGroup.name} — Availability` } }),
    });
    const sheet = await createRes.json();
    if (!createRes.ok) throw new Error(sheet.error?.message || 'Failed to create sheet.');

    // Build data: headers row, then one row per time/day combo
    const memberNames = groupMembers.map(m => m.name);
    const rows = [['Day', 'Time', ...memberNames]];

    for (let d = 0; d < 7; d++) {
      for (let s = 0; s < TOTAL_SLOTS; s++) {
        const row = [DAYS[d], slotToTime(s)];
        for (const m of groupMembers) {
          const avail = m.availability?.[d] || [];
          row.push(avail.includes(s) ? '✓' : '');
        }
        rows.push(row);
      }
    }

    // Write data
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/A1?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: rows }),
      }
    );

    window.open(`https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}`, '_blank');
    showToast('Spreadsheet opened in new tab!', 'success');
  } catch (e) {
    showToast(`Export failed: ${e.message}`, 'error');
  }
}

// ── DOM helpers ───────────────────────────────────────────
function show(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id) { document.getElementById(id)?.classList.add('hidden'); }
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
