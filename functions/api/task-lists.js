// ─────────────────────────────────────────────────────────
//  CLAIRE - Task Lists API (Cloudflare Pages Function)
//  GET    /api/task-lists?adminCode=X  - list all todo_lists
//  POST   /api/task-lists              - create list (admin)
//  PUT    /api/task-lists              - rename list (admin)
//  DELETE /api/task-lists              - delete list (admin)
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
  if (adminCode !== env.ADMIN_CODE) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/todo_lists?order=created_at.asc`,
    {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  const data = await res.json();
  if (!res.ok) return new Response(JSON.stringify({ error: 'Failed to load lists.' }), { status: 500, headers: CORS });
  return new Response(JSON.stringify(data), { status: 200, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400, headers: CORS });
  }

  const { adminCode, name, description } = body;
  if (adminCode !== env.ADMIN_CODE) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }
  if (!name?.trim()) return new Response(JSON.stringify({ error: 'Name required.' }), { status: 400, headers: CORS });

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/todo_lists`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ name: name.trim(), description: description?.trim() || null }),
  });
  const data = await res.json();
  if (!res.ok) return new Response(JSON.stringify({ error: 'Failed to create list.' }), { status: 500, headers: CORS });
  return new Response(JSON.stringify(Array.isArray(data) ? data[0] : data), { status: 200, headers: CORS });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400, headers: CORS });
  }

  const { adminCode, id, name, description } = body;
  if (adminCode !== env.ADMIN_CODE) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }
  if (!id) return new Response(JSON.stringify({ error: 'ID required.' }), { status: 400, headers: CORS });

  const patch = {};
  if (name !== undefined) patch.name = name.trim();
  if (description !== undefined) patch.description = description?.trim() || null;

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/todo_lists?id=eq.${id}`, {
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
  if (!res.ok) return new Response(JSON.stringify({ error: 'Failed to update list.' }), { status: 500, headers: CORS });
  return new Response(JSON.stringify(data), { status: 200, headers: CORS });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400, headers: CORS });
  }

  const { adminCode, id } = body;
  if (adminCode !== env.ADMIN_CODE) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/todo_lists?id=eq.${id}`, {
    method: 'DELETE',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) return new Response(JSON.stringify({ error: 'Failed to delete list.' }), { status: 500, headers: CORS });
  return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
}
