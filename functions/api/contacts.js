// ─────────────────────────────────────────────────────────
//  CLAIRE - Contacts API (Cloudflare Pages Function)
//  GET    /api/contacts?adminCode=X  - list all contact groups
//  POST   /api/contacts              - create contact group
//  PUT    /api/contacts              - update contact group
//  DELETE /api/contacts              - delete contact group
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
    `${env.SUPABASE_URL}/rest/v1/contacts_groups?order=created_at.asc`,
    {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  const data = await res.json();
  if (!res.ok) return new Response(JSON.stringify({ error: 'Failed to load contacts.' }), { status: 500, headers: CORS });
  return new Response(JSON.stringify(data), { status: 200, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let name, members, adminCode;
  try {
    ({ name, members, adminCode } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: CORS });
  }

  if (adminCode !== env.ADMIN_CODE) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }
  if (!name?.trim()) {
    return new Response(JSON.stringify({ error: 'Group name is required.' }), { status: 400, headers: CORS });
  }

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/contacts_groups`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ name: name.trim(), members: Array.isArray(members) ? members : [] }),
  });
  const data = await res.json();
  if (!res.ok) return new Response(JSON.stringify({ error: data.message || 'Failed to create.' }), { status: 500, headers: CORS });
  return new Response(JSON.stringify(Array.isArray(data) ? data[0] : data), { status: 200, headers: CORS });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  let id, name, members, adminCode;
  try {
    ({ id, name, members, adminCode } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: CORS });
  }

  if (adminCode !== env.ADMIN_CODE) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }
  if (!id) return new Response(JSON.stringify({ error: 'ID required.' }), { status: 400, headers: CORS });

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/contacts_groups?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ name: name.trim(), members: Array.isArray(members) ? members : [] }),
  });
  const data = await res.json();
  if (!res.ok) return new Response(JSON.stringify({ error: data.message || 'Failed to update.' }), { status: 500, headers: CORS });
  return new Response(JSON.stringify(data), { status: 200, headers: CORS });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  let id, adminCode;
  try {
    ({ id, adminCode } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: CORS });
  }

  if (adminCode !== env.ADMIN_CODE) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/contacts_groups?id=eq.${id}`, {
    method: 'DELETE',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) return new Response(JSON.stringify({ error: 'Failed to delete.' }), { status: 500, headers: CORS });
  return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
}
