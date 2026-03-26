// ─────────────────────────────────────────────────────────
//  CLAIRE — Group slug redirect (Cloudflare Pages Function)
//  Maps /g/some-group-abc1  →  /group.html?id=some-group-abc1
// ─────────────────────────────────────────────────────────

export async function onRequest(context) {
  const slug   = context.params.slug;
  const origin = new URL(context.request.url).origin;
  return Response.redirect(`${origin}/group.html?id=${encodeURIComponent(slug)}`, 302);
}
