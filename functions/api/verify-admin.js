// ─────────────────────────────────────────────────────────
//  CLAIRE — Verify Admin Code (Cloudflare Pages Function)
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

  let code;
  try {
    ({ code } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: CORS });
  }

  const adminCode = env.ADMIN_CODE;
  if (!adminCode) {
    return new Response(
      JSON.stringify({ error: 'ADMIN_CODE not configured in Cloudflare environment variables.' }),
      { status: 500, headers: CORS }
    );
  }

  if (code === adminCode) {
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  return new Response(JSON.stringify({ error: 'Invalid code' }), { status: 401, headers: CORS });
}
