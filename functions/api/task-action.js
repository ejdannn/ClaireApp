// ─────────────────────────────────────────────────────────
//  CLAIRE - Task Action API (Cloudflare Pages Function)
//  POST /api/task-action
//  Body: { action, taskId, idToken, commentBody? }
//  Actions: 'complete' | 'uncomplete' | 'comment'
//  Uses Google ID token to verify user identity
// ─────────────────────────────────────────────────────────

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS });
}

async function verifyGoogleToken(idToken) {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.email || null;
  } catch {
    return null;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400, headers: CORS });
  }

  const { action, taskId, idToken, commentBody } = body;

  if (!idToken) return new Response(JSON.stringify({ error: 'Auth required.' }), { status: 401, headers: CORS });
  if (!taskId) return new Response(JSON.stringify({ error: 'taskId required.' }), { status: 400, headers: CORS });

  const email = await verifyGoogleToken(idToken);
  if (!email) return new Response(JSON.stringify({ error: 'Invalid or expired token.' }), { status: 401, headers: CORS });

  const sb = {
    url: env.SUPABASE_URL,
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  };

  // Fetch this user's assignment for the task
  const assignRes = await fetch(
    `${sb.url}/rest/v1/task_assignments?task_id=eq.${taskId}&assignee_email=eq.${encodeURIComponent(email)}`,
    { headers: sb.headers }
  );
  const assignments = await assignRes.json();
  const isAssigned = Array.isArray(assignments) && assignments.length > 0;

  // ── Mark complete / uncomplete ─────────────────────────
  if (action === 'complete' || action === 'uncomplete') {
    if (!isAssigned) {
      return new Response(JSON.stringify({ error: 'You are not assigned to this task.' }), { status: 403, headers: CORS });
    }

    const completed_at = action === 'complete' ? new Date().toISOString() : null;
    await fetch(
      `${sb.url}/rest/v1/task_assignments?task_id=eq.${taskId}&assignee_email=eq.${encodeURIComponent(email)}`,
      {
        method: 'PATCH',
        headers: { ...sb.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed_at }),
      }
    );

    // If all assignees done, auto-mark task complete
    const allRes = await fetch(
      `${sb.url}/rest/v1/task_assignments?task_id=eq.${taskId}`,
      { headers: sb.headers }
    );
    const allAssignments = await allRes.json();
    const allDone = Array.isArray(allAssignments) && allAssignments.length > 0 && allAssignments.every(a => a.completed_at);

    if (action === 'complete' && allDone) {
      await fetch(`${sb.url}/rest/v1/tasks?id=eq.${taskId}`, {
        method: 'PATCH',
        headers: { ...sb.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'complete', updated_at: new Date().toISOString() }),
      });
    }

    // Log to history
    await fetch(`${sb.url}/rest/v1/task_history`, {
      method: 'POST',
      headers: { ...sb.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: taskId,
        changed_by: email,
        change_type: action === 'complete' ? 'assignment_completed' : 'assignment_uncompleted',
        new_value: email,
      }),
    });

    return new Response(JSON.stringify({ success: true, allDone }), { status: 200, headers: CORS });
  }

  // ── Add comment ────────────────────────────────────────
  if (action === 'comment') {
    if (!isAssigned) {
      return new Response(JSON.stringify({ error: 'Only assignees can comment.' }), { status: 403, headers: CORS });
    }
    if (!commentBody?.trim()) {
      return new Response(JSON.stringify({ error: 'Comment cannot be empty.' }), { status: 400, headers: CORS });
    }

    const assignee = assignments[0];
    const res = await fetch(`${sb.url}/rest/v1/task_comments`, {
      method: 'POST',
      headers: { ...sb.headers, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        task_id: taskId,
        author_email: email,
        author_name: assignee.assignee_name || null,
        body: commentBody.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) return new Response(JSON.stringify({ error: 'Failed to add comment.' }), { status: 500, headers: CORS });
    return new Response(JSON.stringify(Array.isArray(data) ? data[0] : data), { status: 200, headers: CORS });
  }

  // ── Change status (assignees only) ────────────────────
  if (action === 'status') {
    if (!isAssigned) {
      return new Response(JSON.stringify({ error: 'Only assignees can change status.' }), { status: 403, headers: CORS });
    }
    const { newStatus } = body;
    const allowed = ['todo', 'in_progress', 'complete'];
    if (!allowed.includes(newStatus)) {
      return new Response(JSON.stringify({ error: 'Invalid status.' }), { status: 400, headers: CORS });
    }

    // If marking complete, set completed_at on their assignment
    if (newStatus === 'complete') {
      await fetch(
        `${sb.url}/rest/v1/task_assignments?task_id=eq.${taskId}&assignee_email=eq.${encodeURIComponent(email)}`,
        {
          method: 'PATCH',
          headers: { ...sb.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed_at: new Date().toISOString() }),
        }
      );
    } else {
      await fetch(
        `${sb.url}/rest/v1/task_assignments?task_id=eq.${taskId}&assignee_email=eq.${encodeURIComponent(email)}`,
        {
          method: 'PATCH',
          headers: { ...sb.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed_at: null }),
        }
      );
    }

    // Update the task status itself
    await fetch(`${sb.url}/rest/v1/tasks?id=eq.${taskId}`, {
      method: 'PATCH',
      headers: { ...sb.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, updated_at: new Date().toISOString() }),
    });

    await fetch(`${sb.url}/rest/v1/task_history`, {
      method: 'POST',
      headers: { ...sb.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: taskId,
        changed_by: email,
        change_type: 'status_changed',
        new_value: newStatus,
      }),
    });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  return new Response(JSON.stringify({ error: 'Unknown action.' }), { status: 400, headers: CORS });
}
