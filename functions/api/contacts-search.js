// ─────────────────────────────────────────────────────────
//  CLAIRE - Public Contacts Name Search
//  GET /api/contacts-search?name=X
//  Returns name+email pairs matching the query.
//  Public endpoint — no admin code required.
//  Only returns names/emails, no group structure.
// ─────────────────────────────────────────────────────────

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const query = (url.searchParams.get('name') || '').trim().toLowerCase();

  if (!query || query.length < 2) {
    return new Response(JSON.stringify([]), { status: 200, headers: CORS });
  }

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/contacts_groups?select=members`,
    {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!res.ok) return new Response(JSON.stringify([]), { status: 200, headers: CORS });

  const groups = await res.json();
  const seen = new Set();
  const results = [];

  for (const g of groups) {
    for (const m of (g.members || [])) {
      const key = (m.email || '').toLowerCase();
      if (seen.has(key)) continue;
      const nameMatch  = (m.name  || '').toLowerCase().includes(query);
      const emailMatch = (m.email || '').toLowerCase().includes(query);
      if (nameMatch || emailMatch) {
        seen.add(key);
        results.push({ name: m.name || null, email: m.email || null });
      }
    }
  }

  return new Response(JSON.stringify(results), { status: 200, headers: CORS });
}
