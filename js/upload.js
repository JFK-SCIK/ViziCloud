import { USE_PROXY } from './config.js';
import { showToast } from './ui.js';

const UPLOAD_PWD = '';  // laisser vide si VIZICLOUD_UPLOAD_PWD non configuré côté serveur

export function setupUpload() {
  if (!USE_PROXY) return;

  const $btn   = document.getElementById('upload-btn');
  const $input = document.getElementById('upload-input');
  $btn.style.display = '';

  $btn.addEventListener('click', () => $input.click());

  $input.addEventListener('change', async () => {
    const files = Array.from($input.files);
    $input.value = '';
    if (!files.length) return;

    const total = files.length;
    let done = 0;
    let errors = 0;

    showToast(`Envoi de ${total} fichier${total > 1 ? 's' : ''}…`);

    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      const url = UPLOAD_PWD ? `/upload?pwd=${encodeURIComponent(UPLOAD_PWD)}` : '/upload';
      try {
        const res = await fetch(url, { method: 'POST', body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          throw new Error(err.detail || res.statusText);
        }
        done++;
      } catch (e) {
        errors++;
        showToast(`Erreur : ${file.name} — ${e.message}`);
      }
    }

    if (errors === 0) {
      showToast(`${done} fichier${done > 1 ? 's' : ''} envoyé${done > 1 ? 's' : ''} ✓`);
    } else if (done > 0) {
      showToast(`${done} envoyé${done > 1 ? 's' : ''}, ${errors} erreur${errors > 1 ? 's' : ''}`);
    }
  });
}
