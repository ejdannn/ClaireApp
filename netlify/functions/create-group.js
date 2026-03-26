// ─────────────────────────────────────────────────────────
//  Netlify Function: create-group
//  POST /.netlify/functions/create-group
//  Body: { name, description, adminCode }
//  Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server-side)
// ─────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let name, description, adminCode;
  try {
    ({ name, description, adminCode } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  // Verify admin code
  if (adminCode !== process.env.ADMIN_CODE) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  if (!name || !name.trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Group name is required' }) };
  }

  const supabaseUrl     = process.env.SUPABASE_URL;
  const supabaseKey     = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'Supabase environment variables not configured in Netlify.' }),
    };
  }

  // Generate unique slug
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
    body: JSON.stringify({ name: name.trim(), description: (description || '').trim(), slug }),
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: data.message || 'Failed to create group in database.' }),
    };
  }

  return { statusCode: 200, headers, body: JSON.stringify(Array.isArray(data) ? data[0] : data) };
};
