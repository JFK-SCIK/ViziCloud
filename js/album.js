import { state } from './state.js';
import { USE_PROXY } from './config.js';

export async function loadAlbumConfig() {
  const albums = await fetch('./albums.json').then(r => r.json())
    .catch(() => [{ id: 'B0SJtdOXmeCgIG', name: 'Famille 2024', default: true }]);

  const saved  = localStorage.getItem('vc_album');
  const album  = albums.find(a => a.id === saved) || albums.find(a => a.default) || albums[0];
  state.TOKEN   = album.id;
  state.apiBase = USE_PROXY
    ? `/api/${state.TOKEN}/`
    : `https://p123-sharedstreams.icloud.com/${state.TOKEN}/sharedstreams/`;

  if (albums.length > 1) {
    const sel = document.getElementById('album-select');
    sel.style.display = '';
    sel.innerHTML = albums.map(a =>
      `<option value="${a.id}" ${a.id === state.TOKEN ? 'selected' : ''}>${a.name}</option>`
    ).join('');
    sel.addEventListener('change', () => {
      localStorage.setItem('vc_album', sel.value);
      location.reload();
    });
  }
}
