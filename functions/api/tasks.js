// ─────────────────────────────────────────────────────────
//  CLAIRE - Tasks API (Cloudflare Pages Function)
//  GET    /api/tasks?adminCode=X  - list tasks (admin gets private too)
//  GET    /api/tasks              - list non-private tasks (public)
//  POST   /api/tasks              - create task (admin)
//  PUT    /api/tasks              - update task / status (admin)
//  DELETE /api/tasks              - delete task (admin)
// ─────────────────────────────────────────────────────────

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const adminCode = url.searchParams.get('adminCode');
  const isAdmin = adminCode === env.ADMIN_CODE;

  const filter = isAdmin ? '' : '&is_private=eq.false';

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/tasks?select=*,task_assignments(*),todo_lists(id,name),task_comments(id,created_at)&order=sort_order.asc,created_at.asc${filter}`,
    {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  const data = await res.json();
  if (!res.ok) return new Response(JSON.stringify({ error: 'Failed to load tasks.' }), { status: 500, headers: CORS });
  return new Response(JSON.stringify(data), { status: 200, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400, headers: CORS });
  }

  const { adminCode, title, description, deadline, deadline_time, deadline_tz, department, list_id, is_private, assignments } = body;

  if (adminCode !== env.ADMIN_CODE) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }
  if (!title?.trim()) {
    return new Response(JSON.stringify({ error: 'Title required.' }), { status: 400, headers: CORS });
  }

  const taskBody = {
    title: title.trim(),
    description: description?.trim() || null,
    deadline: deadline || null,
    deadline_time: deadline_time || null,
    deadline_tz: deadline_tz || null,
    department: department?.trim() || null,
    list_id: list_id || null,
    is_private: !!is_private,
    status: 'todo',
  };

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(taskBody),
  });
  const data = await res.json();
  if (!res.ok) return new Response(JSON.stringify({ error: 'Failed to create task.' }), { status: 500, headers: CORS });

  const task = Array.isArray(data) ? data[0] : data;

  if (assignments?.length && task?.id) {
    const assignRows = assignments.map(a => ({
      task_id: task.id,
      assignee_email: a.email,
      assignee_name: a.name || null,
    }));
    await fetch(`${env.SUPABASE_URL}/rest/v1/task_assignments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(assignRows),
    });
  }

  await fetch(`${env.SUPABASE_URL}/rest/v1/task_history`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      task_id: task.id,
      changed_by: 'admin',
      change_type: 'created',
      new_value: title.trim(),
    }),
  });

  return new Response(JSON.stringify(task), { status: 200, headers: CORS });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400, headers: CORS });
  }

  const { adminCode, id, title, description, deadline, deadline_time, deadline_tz, department, list_id, status, assignments } = body;

  if (adminCode !== env.ADMIN_CODE) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }
  if (!id) return new Response(JSON.stringify({ error: 'ID required.' }), { status: 400, headers: CORS });

  const patch = { updated_at: new Date().toISOString() };
  if (title !== undefined) patch.title = title.trim();
  if (description !== undefined) patch.description = description?.trim() || null;
  if (deadline !== undefined) patch.deadline = deadline || null;
  if (deadline_time !== undefined) patch.deadline_time = deadline_time || null;
  if (deadline_tz !== undefined) patch.deadline_tz = deadline_tz || null;
  if (department !== undefined) patch.department = department?.trim() || null;
  if (list_id !== undefined) patch.list_id = list_id || null;
  if (status !== undefined) patch.status = status;

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/tasks?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(patch),
  });
  const data = await res.json();
  if (!res.ok) return new Response(JSON.stringify({ error: 'Failed to update task.' }), { status: 500, headers: CORS });

  if (assignments !== undefined) {
    await fetch(`${env.SUPABASE_URL}/rest/v1/task_assignments?task_id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (assignments.length) {
      await fetch(`${env.SUPABASE_URL}/rest/v1/task_assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify(assignments.map(a => ({
          task_id: id,
          assignee_email: a.email,
          assignee_name: a.name || null,
        }))),
      });
    }
  }

  // Log notable changes to history
  const loggable = ['title', 'status', 'deadline', 'department', 'list_id'];
  for (const field of loggable) {
    if (patch[field] !== undefined) {
      await fetch(`${env.SUPABASE_URL}/rest/v1/task_history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          task_id: id,
          changed_by: 'admin',
          change_type: `${field}_changed`,
          new_value: String(patch[field] ?? ''),
        }),
      });
    }
  }

  return new Response(JSON.stringify(data), { status: 200, headers: CORS });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400, headers: CORS });
  }

  const { adminCode, id, ids } = body;
  if (adminCode !== env.ADMIN_CODE) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }

  // Bulk delete: ids=[...] or single: id='...'
  const filter = (ids && ids.length)
    ? `id=in.(${ids.join(',')})`
    : `id=eq.${id}`;

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/tasks?${filter}`, {
    method: 'DELETE',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) return new Response(JSON.stringify({ error: 'Failed to delete task(s).' }), { status: 500, headers: CORS });
  return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
}
