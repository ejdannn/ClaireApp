// ─────────────────────────────────────────────────────────
//  CLAIRE : Landing page logic (index.html)
// ─────────────────────────────────────────────────────────

const adminCodeInput = document.getElementById('adminCode');
const adminBtn       = document.getElementById('adminBtn');
const adminError     = document.getElementById('adminError');
const groupLinkInput = document.getElementById('groupLink');
const groupBtn       = document.getElementById('groupBtn');
const groupError     = document.getElementById('groupError');

// ── Admin code verification ───────────────────────────────
adminBtn.addEventListener('click', verifyAdmin);
adminCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') verifyAdmin(); });

async function verifyAdmin() {
  const code = adminCodeInput.value.trim();
  if (!code) { showError(adminError, 'Please enter your access code.'); return; }

  adminBtn.disabled = true;
  adminBtn.textContent = '…';
  hideError(adminError);

  try {
    const res = await fetch('/api/verify-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    if (res.ok) {
      saveAdminSession(code);
      window.location.href = '/admin';
    } else {
      showError(adminError, 'Incorrect code. Try again!');
      adminCodeInput.value = '';
      adminCodeInput.focus();
    }
  } catch {
    showError(adminError, 'Network error. Make sure the site is deployed on Cloudflare Pages.');
  } finally {
    adminBtn.disabled = false;
    adminBtn.textContent = 'Enter →';
  }
}

// ── Group link redirect ───────────────────────────────────
groupBtn.addEventListener('click', goToGroup);
groupLinkInput.addEventListener('keydown', e => { if (e.key === 'Enter') goToGroup(); });

function goToGroup() {
  const raw = groupLinkInput.value.trim();
  if (!raw) { showError(groupError, 'Please paste your group link or code.'); return; }
  hideError(groupError);

  // Accept: full URL, /g/slug, or just the slug itself
  let slug = raw;
  try {
    const url = new URL(raw);
    // e.g. https://site.netlify.app/g/my-group-abc1
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && parts[0] === 'g') {
      slug = parts[1];
    } else if (parts.length >= 1) {
      slug = parts[parts.length - 1];
    }
    // Also handle ?id= param
    const idParam = url.searchParams.get('id');
    if (idParam) slug = idParam;
  } catch {
    // Not a URL : treat raw value as the slug
  }

  if (!slug) { showError(groupError, 'Could not read that link. Try pasting just the code.'); return; }
  window.location.href = `/group?id=${encodeURIComponent(slug)}`;
}

// ── helpers ───────────────────────────────────────────────
function showError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }
function hideError(el)      { el.classList.add('hidden'); }

// If already admin, offer shortcut
if (isAdminSession()) {
  const bar = document.createElement('div');
  bar.className = 'success-msg';
  bar.style.cssText = 'text-align:center; margin-top:1rem;';
  bar.innerHTML = `You're logged in as admin. <a href="/admin" style="font-weight:700;">Go to Admin Panel →</a>`;
  document.querySelector('.landing-card').appendChild(bar);
}
