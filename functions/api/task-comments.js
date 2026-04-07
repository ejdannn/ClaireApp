// ─────────────────────────────────────────────────────────
//  CLAIRE - Task Comments API (Cloudflare Pages Function)
//  GET  /api/task-comments?taskId=X        - get comments (public)
//  POST /api/task-comments { taskId, body, adminCode } - admin comment
// ─────────────────────────────────────────────────────────

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const taskId = url.searchParams.get('taskId');

  if (!taskId) return new Response(JSON.stringify({ error: 'taskId required.' }), { status: 400, headers: CORS });

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/task_comments?task_id=eq.${taskId}&order=created_at.asc`,
    {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  const data = await res.json();
  if (!res.ok) return new Response(JSON.stringify({ error: 'Failed to load comments.' }), { status: 500, headers: CORS });
  return new Response(JSON.stringify(data), { status: 200, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400, headers: CORS });
  }

  const { taskId, adminCode, commentBody } = body;

  if (adminCode !== env.ADMIN_CODE) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }
  if (!taskId) return new Response(JSON.stringify({ error: 'taskId required.' }), { status: 400, headers: CORS });
  if (!commentBody?.trim()) return new Response(JSON.stringify({ error: 'Comment cannot be empty.' }), { status: 400, headers: CORS });

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/task_comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      task_id: taskId,
      author_email: 'admin',
      author_name: 'Admin',
      body: commentBody.trim(),
    }),
  });
  const data = await res.json();
  if (!res.ok) return new Response(JSON.stringify({ error: 'Failed to post comment.' }), { status: 500, headers: CORS });
  return new Response(JSON.stringify(Array.isArray(data) ? data[0] : data), { status: 200, headers: CORS });
}
