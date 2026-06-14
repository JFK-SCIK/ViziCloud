import { state } from './state.js';
import { showToast, setLoading, toDate } from './ui.js';
import { icloudPost } from './api.js';
import { loadAlbumConfig } from './album.js';
import { appendBatch, setupScrollObserver } from './gallery.js';
import { buildFilterUI } from './filter.js';
import { openLightbox, closeLightbox, loadLbPhoto, setupLightboxEvents } from './lightbox.js';
import { closeSettings, closeSettingsUI, setupSettingsEvents } from './settings.js';
import { checkVersion, doUpdate, startVersionPolling } from './version.js';
import { setupUpload } from './upload.js';

/* ── Gallery — délégation de clics ───────────────────────── */
const $gallery = document.getElementById('gallery');
$gallery.addEventListener('click', e => {
  const card = e.target.closest('.photo-card[data-index]');
  if (card) openLightbox(+card.dataset.index);
});
$gallery.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.photo-card[data-index]');
  if (card) { e.preventDefault(); openLightbox(+card.dataset.index); }
});

/* ── Settings ─────────────────────────────────────────────── */
setupSettingsEvents();

/* ── Upload ───────────────────────────────────────────────── */
setupUpload();

/* ── Lightbox ─────────────────────────────────────────────── */
setupLightboxEvents();

/* ── Bannière de mise à jour ──────────────────────────────── */
document.querySelector('.btn-update').addEventListener('click', doUpdate);

/* ── Clavier global ───────────────────────────────────────── */
const $lightbox      = document.getElementById('lightbox');
const $settingsPanel = document.getElementById('settings-panel');
document.addEventListener('keydown', e => {
  if ($settingsPanel.classList.contains('open') && e.key === 'Escape') {
    closeSettings(); return;
  }
  if (!$lightbox.classList.contains('open')) return;
  if (e.key === 'Escape')     closeLightbox();
  if (e.key === 'ArrowLeft'  && state.lbIndex > 0)                                loadLbPhoto(state.lbIndex - 1);
  if (e.key === 'ArrowRight' && state.lbIndex < state.filteredPhotos.length - 1) loadLbPhoto(state.lbIndex + 1);
});

/* ── Bouton retour Android (History API) ──────────────────── */
const $lbImg   = document.getElementById('lb-img');
const $lbVideo = document.getElementById('lb-video');
window.addEventListener('popstate', () => {
  // Plein écran vidéo natif (Android) : popstate AVANT fullscreenchange
  // fullscreenElement est encore la vidéo → ignorer, laisser la vidéo sortir du plein écran
  if (document.fullscreenElement && document.fullscreenElement !== document.documentElement) return;
  // iOS : webkitendfullscreen avant popstate → flag de suppression
  if (state.lbSuppressNextPopstate) { state.lbSuppressNextPopstate = false; return; }
  if ($lightbox.classList.contains('open')) {
    // Notre propre plein écran OS → le quitter avant de fermer la lightbox
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    state.lbPushedHistory = false;
    $lbVideo.pause();
    $lbVideo.src = '';
    $lbVideo.style.display = 'none';
    $lbImg.src = '';
    $lbImg.style.display = 'block';
    $lightbox.classList.remove('open');
    document.body.style.overflow = '';
    state.lbIndex = -1;
  } else if ($settingsPanel.classList.contains('open')) {
    state.settingsPushedHistory = false;
    closeSettingsUI();
  }
});

/* ── Service Worker ───────────────────────────────────────── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(console.warn);
  });
}

/* ── Effacer notifs à l'ouverture de l'app ────────────────── */
function _clearNotifications() {
  if (navigator.clearAppBadge) navigator.clearAppBadge();
  navigator.serviceWorker.ready.then(reg => {
    reg.active?.postMessage('clear-notifications');
  }).catch(() => {});
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') _clearNotifications();
});
window.addEventListener('focus', _clearNotifications);
// Aussi au démarrage : app ouverte depuis l'icône (pas de visibilitychange)
_clearNotifications();

/* ── Orientation : lever le lock posé par le manifest à l'install ── */
try { screen.orientation.unlock(); } catch (_) {}

/* ── Version polling ──────────────────────────────────────── */
startVersionPolling();

/* ── Boot ─────────────────────────────────────────────────── */
async function init() {
  checkVersion();
  await loadAlbumConfig();

  setLoading(true, 'Connexion à iCloud…');
  try {
    const stream = await icloudPost('webstream', { streamCtag: null });
    state.allPhotos = (stream.photos || []).sort((a, b) =>
      (toDate(b.dateCreated)?.getTime() ?? 0) - (toDate(a.dateCreated)?.getTime() ?? 0)
    );

    if (stream.streamName) {
      state.albumName = stream.streamName;
      const opt = document.querySelector(`#album-select option[value="${CSS.escape(state.TOKEN)}"]`);
      if (opt) opt.textContent = stream.streamName;
    }

    const n = state.allPhotos.length;
    document.getElementById('count-badge').textContent = `${n} photo${n > 1 ? 's' : ''}`;

    if (n === 0) {
      $gallery.innerHTML = '<div class="empty-state"><h2>Album vide</h2><p>Aucune photo dans cet album.</p></div>';
      setLoading(false);
      return;
    }

    state.filteredPhotos = state.allPhotos;
    buildFilterUI();
    $gallery.innerHTML = '';
    state.loadedCount = 0;
    await appendBatch();
    setupScrollObserver();
  } catch (e) {
    setLoading(false);
    document.getElementById('count-badge').textContent = 'Erreur';
    $gallery.innerHTML = `<div class="empty-state"><h2>Impossible de charger l'album</h2><p>${e.message}</p></div>`;
    showToast(`Erreur : ${e.message}`);
  }
}

init();
