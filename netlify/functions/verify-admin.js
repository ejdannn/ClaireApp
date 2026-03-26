// ─────────────────────────────────────────────────────────
//  Netlify Function: verify-admin
//  POST /.netlify/functions/verify-admin
//  Body: { code: string }
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

  let code;
  try {
    ({ code } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const adminCode = process.env.ADMIN_CODE;
  if (!adminCode) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'ADMIN_CODE environment variable is not set in Netlify.' }),
    };
  }

  if (code === adminCode) {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  }

  return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid code' }) };
};
