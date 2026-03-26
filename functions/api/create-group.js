// ─────────────────────────────────────────────────────────
//  CLAIRE — Create Group (Cloudflare Pages Function)
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

export async function onRequestPost(context) {
  const { request, env } = context;

  let name, description, adminCode, expectedMembers;
  try {
    ({ name, description, adminCode, expectedMembers } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: CORS });
  }

  // Verify admin code
  if (adminCode !== env.ADMIN_CODE) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }

  if (!name || !name.trim()) {
    return new Response(JSON.stringify({ error: 'Group name is required' }), { status: 400, headers: CORS });
  }

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Supabase environment variables not configured in Cloudflare.' }),
      { status: 500, headers: CORS }
    );
  }

  // Generate a unique slug from the group name
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28);
  const rand = Math.random().toString(36).slice(2, 6);
  const slug = `${base}-${rand}`;

  const response = await fetch(`${supabaseUrl}/rest/v1/groups`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      name: name.trim(),
      description: (description || '').trim(),
      slug,
      expected_members: Array.isArray(expectedMembers) ? expectedMembers : [],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return new Response(
      JSON.stringify({ error: data.message || 'Failed to create group in database.' }),
      { status: 500, headers: CORS }
    );
  }

  return new Response(
    JSON.stringify(Array.isArray(data) ? data[0] : data),
    { status: 200, headers: CORS }
  );
}
