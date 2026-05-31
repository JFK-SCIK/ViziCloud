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

export async function openLightbox(index) {
  state.lbIndex = index;
  $lightbox.classList.add('open');
  document.body.style.overflow = 'hidden';
  history.pushState({ lightbox: true }, '');
  state.lbPushedHistory = true;
  await loadLbPhoto(index);
}

export function closeLightbox() {
  $lbVideo.pause();
  $lbVideo.src = '';
  $lbVideo.style.display = 'none';
  $lbImg.src = '';
  $lbImg.style.display = 'block';
  $lightbox.classList.remove('open');
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

  $lbVideo.pause();
  $lbVideo.src = '';
  $lbVideo.style.display = 'none';
  $lbImg.classList.add('fading');
  $lbImg.src = '';
  $lbImg.style.display = 'block';

  if (!state.urlCache[photo.photoGuid]) {
    try { await ensureUrls([photo.photoGuid]); }
    catch (e) { showToast(`Erreur : ${e.message}`); return; }
  }

  const urls  = state.urlCache[photo.photoGuid] || {};
  const src   = urls.full || urls.thumb || '';
  const isVid = urls.isVideo || false;
  const ext   = isVid ? '.mp4' : '.jpg';

  if (src) {
    if (isVid) {
      $lbImg.classList.remove('fading');
      $lbImg.style.display = 'none';
      $lbVideo.style.display = 'block';
      $lbVideo.src = src;
      $lbVideo.load();
    } else {
      $lbImg.onload  = () => $lbImg.classList.remove('fading');
      $lbImg.onerror = () => { $lbImg.classList.remove('fading'); showToast("Impossible de charger l'image"); };
      $lbImg.alt = photo.caption || `Photo ${index + 1}`;
      $lbImg.src = src;
    }
  }

  document.getElementById('lb-download-btn').onclick = () => downloadPhoto(src, `vizicloud_${index + 1}${ext}`);
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
    if (dx < 0 && state.lbIndex < state.filteredPhotos.length - 1) loadLbPhoto(state.lbIndex + 1);
    if (dx > 0 && state.lbIndex > 0) loadLbPhoto(state.lbIndex - 1);
  }, { passive: true });
}
