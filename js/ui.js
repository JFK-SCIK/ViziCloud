const $toast      = document.getElementById('toast');
const $statusBar  = document.getElementById('status-bar');
const $statusText = document.getElementById('status-text');

let toastTimer;

export function showToast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 4500);
}

export function setLoading(on, msg = '') {
  $statusBar.classList.toggle('visible', on);
  if (msg) $statusText.textContent = msg;
}

export function toDate(val) {
  if (!val) return null;
  const d = typeof val === 'number' ? new Date(val * 1000) : new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(val) {
  const d = toDate(val);
  if (!d) return '';
  return d.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
}
