// ─────────────────────────────────────────────────────────
//  CLAIRE : Public tasks page (tasks.html)
// ─────────────────────────────────────────────────────────

let currentUserEmail = null, currentUserName = null, currentIdToken = null;
let publicTasks = [], openDetailTaskId = null, publicFolders = [];

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

// ── Init ──────────────────────────────────────────────────
window.addEventListener('load', () => {
  const clientId = window.CLAIRE_CONFIG?.googleClientId;
  if (!clientId) {
    document.getElementById('googleSignInBtn').innerHTML =
      '<p class="text-muted text-sm" style="color:var(--danger)">Google sign-in not configured.</p>';
    return;
  }

  try {
    google.accounts.id.initialize({ client_id: clientId, callback: handleCredential });
    google.accounts.id.renderButton(
      document.getElementById('googleSignInBtn'),
      { theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular' }
    );
  } catch (e) {
    document.getElementById('googleSignInBtn').innerHTML =
      '<p class="text-muted text-sm">Could not load Google sign-in. Please refresh.</p>';
  }

  loadPublicTasks();
});

// ── Google credential handler ─────────────────────────────
function handleCredential(response) {
  currentIdToken = response.credential;
  try {
    const payload = JSON.parse(atob(response.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    currentUserEmail = payload.email;
    currentUserName  = payload.name || payload.email;
  } catch {
    showToast('Could not read sign-in info.', 'error'); return;
  }
  showSignedIn();
  renderMyTasks();
  renderAllTasks();
}

function showSignedIn() {
  hide('signInView');
  show('tasksView');
  const avatar = document.getElementById('userAvatar');
  avatar.textContent = (currentUserName || currentUserEmail)[0].toUpperCase();
  document.getElementById('userName').textContent = currentUserName || currentUserEmail;
  const badge = document.getElementById('userBadge');
  badge.classList.remove('hidden');
  badge.style.display = 'flex';
}

function signOut() {
  google.accounts.id.disableAutoSelect();
  currentUserEmail = null; currentUserName = null; currentIdToken = null;
  hide('tasksView');
  show('signInView');
  document.getElementById('userBadge').style.display = 'none';
}

// ── Name search helper (checks tasks + all contacts) ─────
let nameSearchTimer = null;
function searchByName(query) {
  const el = document.getElementById('nameSearchResults');
  if (!query.trim() || query.length < 2) { el.innerHTML = ''; return; }

  clearTimeout(nameSearchTimer);
  nameSearchTimer = setTimeout(async () => {
    el.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Searching…</span>';
    const q = query.toLowerCase();
    const found = new Map(); // email → name

    // 1. Check task assignments
    publicTasks.forEach(t => {
      (t.task_assignments || []).forEach(a => {
        if ((a.assignee_name || '').toLowerCase().includes(q) ||
            (a.assignee_email || '').toLowerCase().includes(q)) {
          found.set(a.assignee_email, a.assignee_name || a.assignee_email);
        }
      });
    });

    // 2. Check all contacts
    try {
      const res = await fetch(`/api/contacts-search?name=${encodeURIComponent(query)}`);
      if (res.ok) {
        const contacts = await res.json();
        contacts.forEach(c => {
          if (c.email && !found.has(c.email)) found.set(c.email, c.name || c.email);
        });
      }
    } catch { /* ignore */ }

    if (!found.size) {
      el.innerHTML = '<span style="color:var(--text-muted);font-size:0.875rem;">No matches found.</span>';
      return;
    }
    el.innerHTML = [...found.entries()].map(([email, name]) =>
      `<div style="padding:0.2rem 0;font-size:0.875rem;">
        ${name !== email ? `<strong>${escHtml(name)}</strong> — ` : ''}Sign in as: <strong>${escHtml(email)}</strong>
      </div>`
    ).join('');
  }, 300);
}

// ── Load tasks ────────────────────────────────────────────
async function loadPublicTasks() {
  show('tasksPublicLoading');
  try {
    const [tasksRes, foldersRes] = await Promise.all([
      fetch('/api/tasks'),
      fetch('/api/task-lists'),
    ]);
    if (!tasksRes.ok) throw new Error();
    publicTasks  = await tasksRes.json();
    publicFolders = foldersRes.ok ? await foldersRes.json() : [];
  } catch {
    showToast('Failed to load tasks.', 'error');
  } finally {
    hide('tasksPublicLoading');
  }
  if (currentUserEmail) { renderMyTasks(); renderAllTasks(); }
}

// ── Deadline helpers ──────────────────────────────────────
function deadlineClass(deadline, time) {
  if (!deadline) return '';
  const dt = new Date(String(deadline).slice(0, 10) + 'T00:00:00');
  const now = new Date();
  if (time) {
    const [h, m] = time.split(':').map(Number);
    const fullDt = new Date(dt);
    fullDt.setHours(h, m, 0, 0);
    const diffMs = fullDt - now;
    if (diffMs < 0)       return 'deadline-overdue';
    if (diffMs < 86400000) return 'deadline-today';
    if (diffMs < 259200000) return 'deadline-soon';
    if (diffMs < 604800000) return 'deadline-week';
    return '';
  }
  const days = (dt - now) / 86400000;
  if (days < 0)  return 'deadline-overdue';
  if (days < 1)  return 'deadline-today';
  if (days < 3)  return 'deadline-soon';
  if (days < 7)  return 'deadline-week';
  return '';
}

function deadlineLabel(deadline, time) {
  if (!deadline) return '';
  const dt = new Date(String(deadline).slice(0, 10) + 'T00:00:00');
  const timeSuffix = time ? ` ${_fmt12h(time)}` : '';
  const days = Math.ceil((dt - new Date()) / 86400000);
  if (days < 0)  return `Overdue by ${Math.abs(days)}d${timeSuffix}`;
  if (days === 0) return `Due today${timeSuffix}`;
  if (days === 1) return `Due tomorrow${timeSuffix}`;
  return `Due in ${days}d${timeSuffix}`;
}

function _fmt12h(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ── Folder-grouped rendering helper ──────────────────────
function renderTasksByFolder(tasks, cardFn) {
  if (!tasks.length) return '<p class="text-muted text-sm" style="padding:0.5rem 0;">No tasks.</p>';

  // Build ordered folder list from publicFolders + derive any missing from tasks
  const folderMap = new Map();
  publicFolders.forEach(f => folderMap.set(f.id, { ...f, tasks: [] }));
  // Tasks with no folder or folder not in list
  folderMap.set(null, { id: null, name: 'No Folder', tasks: [] });

  tasks.forEach(t => {
    const fid = t.list_id || null;
    if (!folderMap.has(fid)) {
      folderMap.set(fid, { id: fid, name: t.todo_lists?.name || 'Folder', tasks: [] });
    }
    folderMap.get(fid).tasks.push(t);
  });

  // Sort tasks within each folder: active first, then done; by deadline
  let html = '';
  folderMap.forEach(({ name, tasks: ft, id: fid }) => {
    if (!ft.length) return;
    const active = ft.filter(t => t.status !== 'complete')
      .sort((a, b) => (a.deadline || 'z').localeCompare(b.deadline || 'z'));
    const done = ft.filter(t => t.status === 'complete');

    html += `<div class="pub-folder-group">
      <div class="pub-folder-header">${escHtml(name)}</div>
      <div class="task-pub-list">
        ${active.map(t => cardFn(t)).join('')}
        ${done.length ? `
          <details class="task-done-group">
            <summary class="task-done-summary">${done.length} completed</summary>
            <div class="task-pub-list" style="margin-top:0.4rem;">${done.map(t => cardFn(t)).join('')}</div>
          </details>` : ''}
      </div>
    </div>`;
  });
  return html || '<p class="text-muted text-sm" style="padding:0.5rem 0;">No tasks.</p>';
}

// ── Render my tasks ───────────────────────────────────────
function renderMyTasks() {
  const myTasks = publicTasks.filter(t =>
    (t.task_assignments || []).some(a => a.assignee_email === currentUserEmail)
  );
  const el = document.getElementById('myTasksList');
  el.innerHTML = renderTasksByFolder(myTasks, myTaskCardHtml);
}

const PUB_STATUS_LABELS = { todo: 'To Do', in_progress: 'In Progress', complete: 'Complete' };

function myTaskCardHtml(t) {
  const myAssignment = (t.task_assignments || []).find(a => a.assignee_email === currentUserEmail);
  const dClass = deadlineClass(t.deadline, t.deadline_time);
  const s = t.status;
  return `
    <div class="task-pub-card ${s === 'complete' ? 'task-card-done' : ''} ${dClass} task-card-mine" data-task-id="${t.id}"
         onclick="openPubTaskDetail('${t.id}')">
      <div style="flex:1;min-width:0;">
        <div class="task-card-title ${s === 'complete' ? 'task-done' : ''}">${escHtml(t.title)}${commentBadgeHtml(t)}</div>
        <div class="task-card-meta" style="margin-top:0.25rem;">
          ${t.department ? `<span class="task-tag">${escHtml(t.department)}</span>` : ''}
          ${t.deadline   ? `<span class="task-deadline-pill ${dClass}">${deadlineLabel(t.deadline, t.deadline_time)}</span>` : ''}
          ${t.description ? `<span class="task-tag" style="background:var(--surface2);color:var(--text-muted);">Has details</span>` : ''}
        </div>
        <div class="pub-status-btns" onclick="event.stopPropagation()" style="margin-top:0.5rem;">
          ${['todo','in_progress','complete'].map(st => `
            <button class="pub-status-btn ${s === st ? 'active pub-status-' + st : ''}"
              onclick="setPubTaskStatus('${t.id}', '${st}')">
              ${st === 'complete' ? '✓' : st === 'in_progress' ? '▶' : '○'} ${PUB_STATUS_LABELS[st]}
            </button>`).join('')}
        </div>
      </div>
      <div class="task-card-arrow">›</div>
    </div>`;
}

async function setPubTaskStatus(taskId, newStatus) {
  if (!currentIdToken) { showToast('Please sign in first.', 'error'); return; }
  const res = await fetch('/api/task-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'status', taskId, newStatus, idToken: currentIdToken }),
  });
  const d = await res.json();
  if (!res.ok) { showToast(d.error || 'Failed to update.', 'error'); return; }
  showToast(`Status: ${PUB_STATUS_LABELS[newStatus]}`, 'success');
  await loadPublicTasks();
}

// ── Render all tasks ──────────────────────────────────────
function allTaskCardHtml(t) {
  const isMine = (t.task_assignments || []).some(a => a.assignee_email === currentUserEmail);
  const dClass = deadlineClass(t.deadline, t.deadline_time);
  return `
    <div class="task-pub-card ${t.status === 'complete' ? 'task-card-done' : ''} ${dClass} ${isMine ? 'task-card-mine' : ''}" data-task-id="${t.id}"
         onclick="openPubTaskDetail('${t.id}')">
      <div style="flex:1;min-width:0;">
        <div class="task-card-title ${t.status === 'complete' ? 'task-done' : ''}">${escHtml(t.title)}${commentBadgeHtml(t)}</div>
        <div class="task-card-meta" style="margin-top:0.25rem;">
          ${t.deadline ? `<span class="task-deadline-pill ${dClass}">${deadlineLabel(t.deadline, t.deadline_time)}</span>` : ''}
          ${t.status !== 'todo' ? `<span class="task-tag" style="background:var(--surface2);color:var(--text-muted);">${PUB_STATUS_LABELS[t.status] || t.status}</span>` : ''}
          ${(t.task_assignments||[]).map(a =>
            `<span class="task-chip ${a.assignee_email===currentUserEmail?'task-chip-me':''}">${escHtml(a.assignee_name||a.assignee_email)}</span>`
          ).join('')}
        </div>
      </div>
      <div class="task-card-arrow">›</div>
    </div>`;
}

function renderAllTasks() {
  const el = document.getElementById('allTasksList');
  // Exclude tasks already shown in "Your Tasks"
  const myEmails = new Set(currentUserEmail ? [currentUserEmail] : []);
  const nonMyTasks = publicTasks.filter(t =>
    !(t.task_assignments || []).some(a => myEmails.has(a.assignee_email))
  );
  el.innerHTML = renderTasksByFolder(nonMyTasks, allTaskCardHtml);
}

// ── Task detail modal (public) ────────────────────────────
async function openPubTaskDetail(taskId) {
  openDetailTaskId = taskId;
  const t = publicTasks.find(t => t.id === taskId);
  if (!t) return;
  markTaskSeen(taskId);
  document.querySelectorAll(`[data-task-id="${taskId}"] .task-comment-badge`).forEach(el => el.remove());

  document.getElementById('pubTaskDetailTitle').textContent = t.title;

  const meta = [];
  if (t.department) meta.push(`<span class="task-tag">${escHtml(t.department)}</span>`);
  if (t.deadline)   meta.push(`<span class="task-deadline-pill ${deadlineClass(t.deadline, t.deadline_time)}">${deadlineLabel(t.deadline, t.deadline_time)}</span>`);
  const statusLabels = { todo: 'To Do', in_progress: 'In Progress', complete: 'Complete' };
  meta.push(`<span class="task-tag" style="background:var(--surface2);color:var(--text-muted);">${statusLabels[t.status] || t.status}</span>`);
  document.getElementById('pubTaskDetailMeta').innerHTML = meta.join('');
  document.getElementById('pubTaskDetailDesc').textContent = t.description || '';

  const myAssignment = (t.task_assignments || []).find(a => a.assignee_email === currentUserEmail);
  const mySection  = document.getElementById('pubMyAssignment');
  const commentBox = document.getElementById('pubCommentBox');

  if (myAssignment && currentUserEmail) {
    mySection.classList.remove('hidden');
    document.getElementById('pubAssignmentStatus').innerHTML = `
      <div class="pub-status-btns">
        ${['todo','in_progress','complete'].map(st => `
          <button class="pub-status-btn ${t.status === st ? 'active pub-status-' + st : ''}"
            onclick="setPubTaskStatus('${t.id}', '${st}')">
            ${st === 'complete' ? '✓' : st === 'in_progress' ? '▶' : '○'} ${PUB_STATUS_LABELS[st]}
          </button>`).join('')}
      </div>`;
    commentBox.classList.remove('hidden');
  } else {
    mySection.classList.add('hidden');
    commentBox.classList.add('hidden');
  }

  // Assignee list
  const assignments = t.task_assignments || [];
  document.getElementById('pubTaskAssignees').innerHTML = assignments.length
    ? assignments.map(a => `
        <div class="task-detail-assignee">
          <div class="task-chip-avatar">${(a.assignee_name || a.assignee_email)[0].toUpperCase()}</div>
          <div style="flex:1;">
            <div class="text-sm" style="font-weight:600;">${escHtml(a.assignee_name || a.assignee_email)}</div>
            ${a.assignee_name ? `<div class="text-sm text-muted">${escHtml(a.assignee_email)}</div>` : ''}
          </div>
          <span class="task-tag ${a.completed_at ? 'tag-done' : ''}">${a.completed_at ? 'Done' : 'Pending'}</span>
        </div>`).join('')
    : '<span class="text-muted text-sm">No one assigned.</span>';

  document.getElementById('pubCommentInput').value = '';
  document.getElementById('pubTaskComments').innerHTML = '<span class="text-muted text-sm">Loading…</span>';
  show('pubTaskDetailModal');

  const res = await fetch(`/api/task-comments?taskId=${taskId}`);
  const comments = res.ok ? await res.json() : [];
  document.getElementById('pubTaskComments').innerHTML = comments.length
    ? comments.map(c => `
        <div class="task-comment">
          <div class="task-comment-author">${escHtml(c.author_name || c.author_email)}</div>
          <div class="task-comment-body">${escHtml(c.body)}</div>
          <div class="task-comment-time">${new Date(c.created_at).toLocaleString()}</div>
        </div>`).join('')
    : '<span class="text-muted text-sm">No comments yet.</span>';
}

function closePubTaskDetail() { hide('pubTaskDetailModal'); }

async function submitComment() {
  const input = document.getElementById('pubCommentInput');
  const body  = input.value.trim();
  if (!body || !currentIdToken || !openDetailTaskId) return;

  const btn = input.nextElementSibling;
  btn.disabled = true;
  const res = await fetch('/api/task-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'comment', taskId: openDetailTaskId, idToken: currentIdToken, commentBody: body }),
  });
  btn.disabled = false;
  const d = await res.json();
  if (!res.ok) { showToast(d.error || 'Failed to post comment.', 'error'); return; }
  input.value = '';
  showToast('Comment added!', 'success');
  openPubTaskDetail(openDetailTaskId);
}
