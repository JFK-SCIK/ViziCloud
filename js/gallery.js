import { state } from './state.js';
import { PAGE_SIZE } from './config.js';
import { ensureUrls } from './api.js';
import { showToast, setLoading } from './ui.js';

const $gallery = document.getElementById('gallery');

export async function appendBatch() {
  if (state.isLoadingBatch || state.loadedCount >= state.filteredPhotos.length) return;
  state.isLoadingBatch = true;

  const start = state.loadedCount;
  const end   = Math.min(start + PAGE_SIZE, state.filteredPhotos.length);
  const slice = state.filteredPhotos.slice(start, end);

  $gallery.insertAdjacentHTML('beforeend',
    slice.map(() => '<div class="photo-card skeleton"></div>').join('')
  );
  setLoading(true, `Chargement ${end} / ${state.filteredPhotos.length}…`);

  try {
    await ensureUrls(slice.map(p => p.photoGuid));
    $gallery.querySelectorAll('.photo-card.skeleton').forEach(s => s.remove());
    $gallery.insertAdjacentHTML('beforeend', slice.map((photo, i) => {
      const urls  = state.urlCache[photo.photoGuid] || {};
      const isVid = photo.mediaAssetType === 'video';
      const idx   = start + i;
      const alt   = photo.caption || `Photo ${idx + 1}`;
      return `<div class="photo-card" data-index="${idx}" role="button" tabindex="0" aria-label="${alt.replace(/"/g, '&quot;')}">
        ${urls.thumb ? `<img src="${urls.thumb}" alt="" loading="lazy" decoding="async">` : ''}
        ${isVid ? `<span class="video-badge" aria-label="Vidéo"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></span>` : ''}
      </div>`;
    }).join(''));
    state.loadedCount = end;
  } catch (e) {
    $gallery.querySelectorAll('.photo-card.skeleton').forEach(s => s.remove());
    showToast(`Erreur de chargement : ${e.message}`);
  } finally {
    state.isLoadingBatch = false;
    setLoading(false);
  }
}

export function setupScrollObserver() {
  const sentinel = document.getElementById('scroll-sentinel');
  if (!sentinel) return;
  new IntersectionObserver(
    entries => { if (entries[0].isIntersecting) appendBatch(); },
    { rootMargin: '300px' }
  ).observe(sentinel);
}
