let loadedCommit = null;

export async function checkVersion() {
  try {
    const data = await fetch('./version.json', { cache: 'no-store' }).then(r => r.json());
    if (!data?.commit || data.commit === '?') return;
    if (!loadedCommit) {
      loadedCommit = data.commit;
      const el = document.getElementById('commit-ref');
      if (el) el.textContent = data.commit;
      const sc = document.getElementById('settings-commit');
      if (sc) sc.textContent = data.commit;
      return;
    }
    if (data.commit !== loadedCommit) {
      document.getElementById('update-banner').classList.add('visible');
    }
  } catch (_) {}
}

export async function doUpdate() {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
    await Promise.all(regs.map(r => r.unregister()));
    const keys = await caches.keys().catch(() => []);
    await Promise.all(keys.map(k => caches.delete(k)));
  }
  location.reload(true);
}

export function startVersionPolling() {
  setInterval(checkVersion, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkVersion();
  });
}
