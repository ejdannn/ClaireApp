// ─────────────────────────────────────────────────────────
//  CLAIRE : Public tasks page (tasks.html)
// ─────────────────────────────────────────────────────────

let currentUserEmail = null, currentUserName = null, currentIdToken = null;
let publicTasks = [], openDetailTaskId = null;

// ── Google Sign-In ────────────────────────────────────────
window.addEventListener('load', () => {
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredential,
  });
  google.accounts.id.renderButton(
    document.getElementById('googleSignInBtn'),
    { theme: 'outline', size: 'large', text: 'signin_with' }
  );
  loadPublicTasks();
});

function handleCredential(response) {
  currentIdToken = response.credential;
  const payload = JSON.parse(atob(response.credential.split('.')[1]));
  currentUserEmail = payload.email;
  currentUserName  = payload.name || payload.email;
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
  document.getElementById('userBadge').classList.remove('hidden');
  document.getElementById('userBadge').style.display = 'flex';
}

function signOut() {
  google.accounts.id.disableAutoSelect();
  currentUserEmail = null; currentUserName = null; currentIdToken = null;
  hide('tasksView');
  show('signInView');
  document.getElementById('userBadge').classList.add('hidden');
}

// ── Name search helper ────────────────────────────────────
function searchByName(query) {
  const el = document.getElementById('nameSearchResults');
  if (!query.trim() || !publicTasks.length) { el.innerHTML = ''; return; }
  const q = query.toLowerCase();
  const found = new Set();
  publicTasks.forEach(t => {
    (t.task_assignments || []).forEach(a => {
      if ((a.assignee_name || '').toLowerCase().includes(q)) {
        found.add(a.assignee_email);
      }
    });
  });
  if (!found.size) { el.innerHTML = 'No matches found.'; return; }
  el.innerHTML = [...found].map(e => `<div>Try signing in as: <strong>${escHtml(e)}</strong></div>`).join('');
}

// ── Load tasks ────────────────────────────────────────────
async function loadPublicTasks() {
  show('tasksPublicLoading');
  const res = await fetch('/api/tasks');
  hide('tasksPublicLoading');
  if (!res.ok) { showToast('Failed to load tasks.', 'error'); return; }
  publicTasks = await res.json();
  if (currentUserEmail) {
    renderMyTasks();
    renderAllTasks();
  }
}

// ── Deadline helpers ──────────────────────────────────────
function deadlineClass(deadline) {
  if (!deadline) return '';
  const days = (new Date(deadline) - new Date()) / 86400000;
  if (days < 0)  return 'deadline-overdue';
  if (days < 1)  return 'deadline-today';
  if (days < 3)  return 'deadline-soon';
  if (days < 7)  return 'deadline-week';
  return 'deadline-ok';
}

function deadlineLabel(deadline) {
  if (!deadline) return '';
  const days = Math.ceil((new Date(deadline) - new Date()) / 86400000);
  if (days < 0)  return `Overdue by ${Math.abs(days)}d`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days}d`;
}

// ── Render my tasks ───────────────────────────────────────
function renderMyTasks() {
  const myTasks = publicTasks.filter(t =>
    (t.task_assignments || []).some(a => a.assignee_email === currentUserEmail)
  );
  const el = document.getElementById('myTasksList');

  if (!myTasks.length) {
    el.innerHTML = '<p class="text-muted text-sm">No tasks assigned to you yet.</p>';
    return;
  }

  const active = myTasks.filter(t => t.status !== 'complete');
  const done   = myTasks.filter(t => t.status === 'complete');

  el.innerHTML = [
    ...active.map(t => myTaskCardHtml(t)),
    done.length ? `<details class="task-done-group"><summary class="task-done-summary">${done.length} completed</summary>${done.map(t => myTaskCardHtml(t)).join('')}</details>` : '',
  ].join('');
}

function myTaskCardHtml(t) {
  const myAssignment = (t.task_assignments || []).find(a => a.assignee_email === currentUserEmail);
  const isDone = !!myAssignment?.completed_at;
  const dClass = deadlineClass(t.deadline);

  return `
    <div class="task-card ${isDone ? 'task-card-done' : ''} ${dClass}" style="cursor:pointer;" onclick="openPubTaskDetail('${t.id}')">
      <div class="task-card-left">
        <input type="checkbox" class="task-pub-check" ${isDone ? 'checked' : ''}
          onclick="event.stopPropagation()"
          onchange="toggleMyTask('${t.id}', this.checked)" />
      </div>
      <div class="task-card-body">
        <div class="task-card-title ${isDone ? 'task-done' : ''}">${escHtml(t.title)}</div>
        <div class="task-card-meta">
          ${t.department ? `<span class="task-tag">${escHtml(t.department)}</span>` : ''}
          ${t.deadline   ? `<span class="task-deadline-pill ${dClass}">${deadlineLabel(t.deadline)}</span>` : ''}
        </div>
      </div>
    </div>`;
}

async function toggleMyTask(taskId, checked) {
  if (!currentIdToken) { showToast('Please sign in first.', 'error'); return; }
  const res = await fetch('/api/task-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: checked ? 'complete' : 'uncomplete',
      taskId, idToken: currentIdToken,
    }),
  });
  if (!res.ok) {
    const d = await res.json();
    showToast(d.error || 'Failed to update.', 'error');
  } else {
    showToast(checked ? 'Marked complete!' : 'Marked incomplete.', 'success');
    await loadPublicTasks();
  }
}

// ── Render all tasks ──────────────────────────────────────
function renderAllTasks() {
  const el = document.getElementById('allTasksList');
  const statusOrder = { in_progress: 0, todo: 1, complete: 2 };
  const sorted = [...publicTasks].sort((a, b) => (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1));

  if (!sorted.length) { el.innerHTML = '<p class="text-muted text-sm">No tasks yet.</p>'; return; }

  el.innerHTML = sorted.map(t => {
    const isMine = (t.task_assignments || []).some(a => a.assignee_email === currentUserEmail);
    const dClass = deadlineClass(t.deadline);
    return `
      <div class="task-card ${t.status === 'complete' ? 'task-card-done' : ''} ${dClass} ${isMine ? 'task-card-mine' : ''}"
           style="cursor:pointer;" onclick="openPubTaskDetail('${t.id}')">
        <div class="task-card-body">
          <div class="task-card-title ${t.status === 'complete' ? 'task-done' : ''}">${escHtml(t.title)}</div>
          <div class="task-card-meta">
            ${t.department ? `<span class="task-tag">${escHtml(t.department)}</span>` : ''}
            ${t.deadline   ? `<span class="task-deadline-pill ${dClass}">${deadlineLabel(t.deadline)}</span>` : ''}
            <span class="task-tag" style="background:var(--surface2);">${t.status.replace('_',' ')}</span>
            ${(t.task_assignments||[]).map(a =>
              `<span class="task-chip ${a.assignee_email===currentUserEmail?'task-chip-me':''}">${escHtml(a.assignee_name||a.assignee_email)}</span>`
            ).join('')}
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── Task detail modal (public) ────────────────────────────
async function openPubTaskDetail(taskId) {
  openDetailTaskId = taskId;
  const t = publicTasks.find(t => t.id === taskId);
  if (!t) return;

  document.getElementById('pubTaskDetailTitle').textContent = t.title;

  const meta = [];
  if (t.department) meta.push(`<span class="task-tag">${escHtml(t.department)}</span>`);
  if (t.deadline)   meta.push(`<span class="task-deadline-pill ${deadlineClass(t.deadline)}">${deadlineLabel(t.deadline)}</span>`);
  meta.push(`<span class="task-tag">${t.status.replace('_',' ')}</span>`);
  document.getElementById('pubTaskDetailMeta').innerHTML = meta.join('');
  document.getElementById('pubTaskDetailDesc').textContent = t.description || '';

  const myAssignment = (t.task_assignments || []).find(a => a.assignee_email === currentUserEmail);
  const mySection = document.getElementById('pubMyAssignment');
  const commentBox = document.getElementById('pubCommentBox');

  if (myAssignment && currentUserEmail) {
    mySection.classList.remove('hidden');
    const isDone = !!myAssignment.completed_at;
    document.getElementById('pubAssignmentStatus').innerHTML = `
      <label style="display:flex;align-items:center;gap:0.6rem;cursor:pointer;">
        <input type="checkbox" ${isDone ? 'checked' : ''} onchange="toggleMyTask('${t.id}', this.checked)" />
        <span class="text-sm">${isDone ? 'Marked as complete' : 'Mark as complete'}</span>
      </label>`;
    commentBox.classList.remove('hidden');
  } else {
    mySection.classList.add('hidden');
    commentBox.classList.add('hidden');
  }

  document.getElementById('pubTaskComments').innerHTML = '<span class="text-muted text-sm">Loading…</span>';
  show('pubTaskDetailModal');

  const res = await fetch(`/api/task-comments?taskId=${taskId}`);
  const comments = res.ok ? await res.json() : [];
  document.getElementById('pubTaskComments').innerHTML = comments.length
    ? comments.map(c => `
        <div class="task-comment">
          <div class="task-comment-author">${escHtml(c.author_name || c.author_email)}</div>
          <div class="task-comment-body">${escHtml(c.body)}</div>
          <div class="task-comment-time text-muted text-sm">${new Date(c.created_at).toLocaleString()}</div>
        </div>`).join('')
    : '<span class="text-muted text-sm">No comments yet.</span>';
}

function closePubTaskDetail() { hide('pubTaskDetailModal'); }

async function submitComment() {
  const input = document.getElementById('pubCommentInput');
  const body  = input.value.trim();
  if (!body || !currentIdToken || !openDetailTaskId) return;

  const res = await fetch('/api/task-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'comment', taskId: openDetailTaskId, idToken: currentIdToken, commentBody: body }),
  });
  if (!res.ok) {
    const d = await res.json();
    showToast(d.error || 'Failed to post comment.', 'error');
    return;
  }
  input.value = '';
  showToast('Comment added!', 'success');
  openPubTaskDetail(openDetailTaskId);
}
