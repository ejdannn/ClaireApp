// ─────────────────────────────────────────────────────────
//  CLAIRE - Task Comments API (Cloudflare Pages Function)
//  GET /api/task-comments?taskId=X  - get comments (public)
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
