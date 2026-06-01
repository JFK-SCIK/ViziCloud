import { USE_PROXY } from './config.js';

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function getVapidKey() {
  const res = await fetch('/push/vapid-public-key');
  if (!res.ok) throw new Error(`Serveur : ${res.status}`);
  return (await res.json()).key;
}

export async function subscribePush() {
  // 1 — Clé VAPID
  let vapidKey;
  try { vapidKey = await getVapidKey(); }
  catch (e) { throw new Error(`Notifications non configurées sur le serveur (${e.message})`); }
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
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
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
    label.textContent = s === 'denied'     ? 'Bloquées (paramètres navigateur)'
                      : s === 'subscribed' ? 'Activées'
                      : 'Désactivées';
    label.style.color = '';
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
