// ─────────────────────────────────────────────────────────
//  CLAIRE - Update Group (Cloudflare Pages Function)
//  PUT /api/update-group
//  Body: { id, name, description, expectedMembers, adminCode }
// ─────────────────────────────────────────────────────────

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function onRequestPut(context) {
  const { request, env } = context;

  let id, name, description, expectedMembers, adminCode, schedule_mode, date_window;
  try {
    ({ id, name, description, expectedMembers, adminCode, schedule_mode, date_window } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: CORS });
  }

  if (adminCode !== env.ADMIN_CODE) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }
  if (!id) {
    return new Response(JSON.stringify({ error: 'Group ID is required.' }), { status: 400, headers: CORS });
  }

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Supabase environment variables not configured.' }),
      { status: 500, headers: CORS }
    );
  }

  const patch = {};
  if (name !== undefined)            patch.name            = name.trim();
  if (description !== undefined)     patch.description     = (description || '').trim();
  if (expectedMembers !== undefined) patch.expected_members = Array.isArray(expectedMembers) ? expectedMembers : [];
  if (schedule_mode !== undefined)   patch.schedule_mode   = schedule_mode;
  if (date_window !== undefined)     patch.date_window     = Array.isArray(date_window) ? date_window : [];

  const res = await fetch(`${supabaseUrl}/rest/v1/groups?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(patch),
  });

  const data = await res.json();
  if (!res.ok) {
    return new Response(
      JSON.stringify({ error: data.message || 'Failed to update schedule.' }),
      { status: 500, headers: CORS }
    );
  }

  return new Response(
    JSON.stringify(Array.isArray(data) ? data[0] : data),
    { status: 200, headers: CORS }
  );
}
