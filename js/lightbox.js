import { state } from './state.js';
import { ensureUrls } from './api.js';
import { showToast, formatDate } from './ui.js';

const $lightbox  = document.getElementById('lightbox');
const $lbImg     = document.getElementById('lb-img');
const $lbVideo   = document.getElementById('lb-video');
const $lbCounter = document.getElementById('lb-counter');
const $lbCaption = document.getElementById('lb-caption');
const $lbDate    = document.getElementById('lb-date');
const $lbPrev    = document.getElementById('lb-prev');
const $lbNext    = document.getElementById('lb-next');
const $lbWrap    = document.getElementById('lb-wrap');

function _enterFullscreen() {
  document.documentElement.requestFullscreen().catch(() => {});
}
function _exitFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

const _landscape = window.matchMedia('(orientation: landscape)');
_landscape.addEventListener('change', mq => {
  if (!$lightbox.classList.contains('open')) return;
  $lightbox.classList.toggle('chrome-hidden', mq.matches);
  if (mq.matches) _enterFullscreen(); else _exitFullscreen();
});

export async function openLightbox(index) {
  state.lbIndex = index;
  $lightbox.classList.add('open');
  const inLandscape = _landscape.matches;
  $lightbox.classList.toggle('chrome-hidden', inLandscape);
  if (inLandscape) _enterFullscreen();
  document.body.style.overflow = 'hidden';
  history.pushState({ lightbox: true }, '');
  state.lbPushedHistory = true;
  await loadLbPhoto(index);
}

export function closeLightbox() {
  _exitFullscreen();
  $lbImg.onload  = null;
  $lbImg.onerror = null;
  $lbImg.src     = '';
  $lbVideo.pause();
  $lbVideo.removeAttribute('src');
  $lbVideo.load();
  $lbVideo.style.display = 'none';
  $lbImg.style.display = 'block';
  $lightbox.classList.remove('open', 'chrome-hidden');
  document.body.style.overflow = '';
  state.lbIndex = -1;
  if (state.lbPushedHistory) {
    state.lbPushedHistory = false;
    history.back();
  }
}

export async function loadLbPhoto(index) {
  const photo = state.filteredPhotos[index];
  if (!photo) return;
  state.lbIndex = index;

  $lbCounter.textContent = `${index + 1} / ${state.filteredPhotos.length}`;
  $lbCaption.textContent = photo.caption || '';
  $lbDate.textContent    = formatDate(photo.dateCreated);
  $lbPrev.hidden = index <= 0;
  $lbNext.hidden = index >= state.filteredPhotos.length - 1;

  // Libérer proprement les ressources de la photo/vidéo précédente
  $lbImg.onload  = null;
  $lbImg.onerror = null;
  $lbImg.src     = '';
  $lbImg.style.display = 'block';

  $lbVideo.pause();
  $lbVideo.removeAttribute('src');  // removeAttribute + load() libère la mémoire vidéo
  $lbVideo.load();
  $lbVideo.style.display = 'none';

  if (!state.urlCache[photo.photoGuid]) {
    try { await ensureUrls([photo.photoGuid]); }
    catch (e) { showToast(`Erreur : ${e.message}`); return; }
  }

  const urls  = state.urlCache[photo.photoGuid] || {};
  const src   = urls.full || urls.thumb || '';
  const isVid = urls.isVideo || false;

  if (src) {
    if (isVid) {
      $lbImg.style.display = 'none';
      $lbVideo.style.display = 'block';
      $lbVideo.src = src;
      $lbVideo.load();
    } else {
      $lbImg.onerror = async () => {
        // URL iCloud expirée : purger le cache et retenter une fois
        // Capturer le guid maintenant — après l'await l'utilisateur a peut-être swipé
        const guid = photo.photoGuid;
        delete state.urlCache[guid];
        try {
          await ensureUrls([guid]);
          // Vérifier qu'on est toujours sur la même photo
          if (state.filteredPhotos[state.lbIndex]?.photoGuid !== guid) return;
          const fresh = state.urlCache[guid];
          if (fresh?.full || fresh?.thumb) {
            $lbImg.onerror = () => showToast("Impossible de charger l'image");
            $lbImg.src = fresh.full || fresh.thumb;
            return;
          }
        } catch (_) {}
        if (state.filteredPhotos[state.lbIndex]?.photoGuid === guid) {
          showToast("Impossible de charger l'image");
        }
      };
      $lbImg.alt = photo.caption || `Photo ${index + 1}`;
      $lbImg.src = src;
    }
  }

  document.getElementById('lb-download-btn').onclick = () => downloadPhoto(src, buildPhoSyFilename(photo, src, isVid));

  // Précharger silencieusement l'URL de la photo suivante
  const nextPhoto = state.filteredPhotos[index + 1];
  if (nextPhoto && !state.urlCache[nextPhoto.photoGuid]) {
    ensureUrls([nextPhoto.photoGuid]).catch(() => {});
  }
}

function buildPhoSyFilename(photo, url, isVideo) {
  const d        = photo.dateCreated ? new Date(photo.dateCreated) : new Date();
  const datePart = `${d.getFullYear()} ${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')}`;
  const album    = state.albumName || 'ViziCloud';
  let photoName  = '';
  let ext        = isVideo ? 'mp4' : 'jpg';
  try {
    const u         = new URL(url);
    const nameParam = u.searchParams.get('name') || '';
    const nm        = nameParam.match(/^(.+)\.([a-zA-Z0-9]{2,4})$/);
    if (nm) { photoName = nm[1]; ext = nm[2].toLowerCase(); }
    else {
      const raw = decodeURIComponent(u.pathname.split('/').pop() || '');
      const pm  = raw.match(/^(.+)\.([a-zA-Z0-9]{2,4})$/);
      if (pm) { photoName = pm[1]; ext = pm[2].toLowerCase(); }
    }
  } catch (_) {}
  if (!photoName) photoName = photo.caption || '';
  const suffix = photoName ? ` (${photoName})` : '';
  return `${datePart} - ${album}${suffix}.${ext}`;
}

async function downloadPhoto(url, filename) {
  if (!url) return;
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    const a    = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: filename,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (_) {
    window.open(url, '_blank');
  }
}

export function setupLightboxEvents() {
  document.getElementById('lb-close').addEventListener('click', closeLightbox);
  document.getElementById('lb-back').addEventListener('click', closeLightbox);

  $lbPrev.addEventListener('click', () => {
    if (state.lbIndex > 0) loadLbPhoto(state.lbIndex - 1);
  });
  $lbNext.addEventListener('click', () => {
    if (state.lbIndex < state.filteredPhotos.length - 1) loadLbPhoto(state.lbIndex + 1);
  });

  // Tap image → toggle chrome-hidden + plein écran OS
  $lbWrap.addEventListener('click', e => {
    if (state.lbWasSwipe) { state.lbWasSwipe = false; return; }
    if (e.target.closest('.lb-nav, video, button')) return;
    const willHide = !$lightbox.classList.contains('chrome-hidden');
    $lightbox.classList.toggle('chrome-hidden');
    if (willHide) _enterFullscreen(); else _exitFullscreen();
  });

  // Plein écran vidéo natif : fullscreenchange/webkitendfullscreen
  // déclenche un popstate parasite — on le supprime SAUF si c'est notre propre fullscreen
  const _suppressFs = () => {
    if (document.fullscreenElement === document.documentElement) return;
    state.lbSuppressNextPopstate = true;
    setTimeout(() => { state.lbSuppressNextPopstate = false; }, 500);
  };
  $lbVideo.addEventListener('webkitendfullscreen', _suppressFs);
  document.addEventListener('fullscreenchange', _suppressFs);

  // Swipe tactile — inhibé si zoom actif
  $lightbox.addEventListener('touchstart', e => {
    state.touchIsZoom = e.touches.length > 1;
    if (!state.touchIsZoom) state.touchStartX = e.changedTouches[0].clientX;
  }, { passive: true });

  $lightbox.addEventListener('touchmove', e => {
    if (e.touches.length > 1) state.touchIsZoom = true;
  }, { passive: true });

  $lightbox.addEventListener('touchend', e => {
    if (state.touchIsZoom) { state.touchIsZoom = false; return; }
    if ((window.visualViewport?.scale ?? 1) > 1.05) return;
    const dx = e.changedTouches[0].clientX - state.touchStartX;
    if (Math.abs(dx) < 50) return;
    state.lbWasSwipe = true;
    if (dx < 0 && state.lbIndex < state.filteredPhotos.length - 1) loadLbPhoto(state.lbIndex + 1);
    if (dx > 0 && state.lbIndex > 0) loadLbPhoto(state.lbIndex - 1);
  }, { passive: true });
}
