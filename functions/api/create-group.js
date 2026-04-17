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

  let name, description, adminCode, expectedMembers, customSlug, schedule_mode, date_window;
  try {
    ({ name, description, adminCode, expectedMembers, customSlug, schedule_mode, date_window } = await request.json());
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

  // Determine slug: use custom if provided, otherwise auto-generate
  let slug;
  if (customSlug && customSlug.trim()) {
    // Sanitize: lowercase, only letters/numbers/hyphens, trim hyphens, max 40 chars
    slug = customSlug.trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 40);

    if (slug.length < 3) {
      return new Response(JSON.stringify({ error: 'Custom link must be at least 3 characters.' }), { status: 400, headers: CORS });
    }

    // Check for slug conflict
    const checkRes = await fetch(
      `${supabaseUrl}/rest/v1/groups?slug=eq.${encodeURIComponent(slug)}&select=id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    const existing = await checkRes.json();
    if (Array.isArray(existing) && existing.length > 0) {
      return new Response(
        JSON.stringify({ error: `The link "${slug}" is already in use. Please choose a different one.` }),
        { status: 409, headers: CORS }
      );
    }
  } else {
    // Auto-generate a unique slug from the group name
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28);
    const rand = Math.random().toString(36).slice(2, 6);
    slug = `${base}-${rand}`;
  }

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
      schedule_mode: schedule_mode || 'weekly',
      date_window: Array.isArray(date_window) ? date_window : [],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    // Handle unique constraint violation from Supabase (code 23505)
    if (data.code === '23505' || (data.message || '').includes('unique')) {
      return new Response(
        JSON.stringify({ error: `The link "${slug}" is already in use. Please choose a different one.` }),
        { status: 409, headers: CORS }
      );
    }
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
