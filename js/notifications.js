import { USE_PROXY } from './config.js';

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function getVapidInfo() {
  const res = await fetch('/push/vapid-public-key');
  if (!res.ok) throw new Error(`Serveur : ${res.status}`);
  return await res.json(); // { key, generated_at }
}

export async function subscribePush() {
  // 1 — Clé VAPID
  let info;
  try { info = await getVapidInfo(); }
  catch (e) { throw new Error(`Notifications non configurées sur le serveur (${e.message})`); }
  const vapidKey = info?.key;
  if (!vapidKey) throw new Error('Clé VAPID absente');

  // 2 — Permission navigateur
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(
    perm === 'denied'
      ? 'Permission refusée — activez les notifs dans les paramètres du navigateur'
      : 'Permission non accordée'
  );

  // 3 — Abonnement push
  const reg = await navigator.serviceWorker.ready;
  let sub;
  try {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(info.key),
    });
  } catch (e) {
    throw new Error(`Échec abonnement push : ${e.message}`);
  }

  // 4 — Envoi au serveur
  const res = await fetch('/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) throw new Error(`Enregistrement serveur échoué (${res.status})`);
}

export async function unsubscribePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await fetch('/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
  if (navigator.clearAppBadge) navigator.clearAppBadge();
}

async function getNotifState() {
  if (!USE_PROXY || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg) return 'unsupported';
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'subscribed' : 'unsubscribed';
}

export async function setupNotificationToggle() {
  const section = document.getElementById('notif-section');
  if (!section) return;

  const state = await getNotifState();
  if (state === 'unsupported') { section.style.display = 'none'; return; }
  section.style.display = '';

  const toggle = document.getElementById('notif-toggle');
  const label  = document.getElementById('notif-label');

  async function refresh() {
    const s = await getNotifState();
    toggle.checked  = s === 'subscribed';
    toggle.disabled = s === 'denied';
    label.style.color = '';

    if (s === 'denied') {
      label.textContent = 'Bloquées (paramètres navigateur)';
      return;
    }
    if (s === 'unsubscribed') {
      label.textContent = 'Désactivées';
      return;
    }

    // subscribed — enrichir avec date VAPID + endpoint
    const lines = ['Activées'];
    try {
      const [vapidInfo, reg] = await Promise.all([
        getVapidInfo().catch(() => null),
        navigator.serviceWorker.ready,
      ]);
      if (vapidInfo?.generated_at) {
        const d = new Date(vapidInfo.generated_at);
        lines.push(`Clés serveur : ${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`);
      }
      const sub = await reg.pushManager.getSubscription();
      if (sub?.endpoint) {
        lines.push(`Abonnement : …${sub.endpoint.slice(-36)}`);
      }
    } catch (_) {}
    label.textContent = lines.join('\n');
  }

  await refresh();

  toggle.addEventListener('change', async () => {
    toggle.disabled = true;
    label.style.color = '';
    label.textContent = toggle.checked ? 'Activation en cours…' : 'Désactivation…';
    try {
      if (toggle.checked) await subscribePush();
      else await unsubscribePush();
    } catch (e) {
      label.textContent = e.message;
      label.style.color = 'var(--danger)';
    } finally {
      toggle.disabled = false;
      await refresh().catch(() => {});
    }
  });
}
