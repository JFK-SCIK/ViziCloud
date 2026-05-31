import { state } from './state.js';

export async function icloudPost(endpoint, body, isRetry = false) {
  const res = await fetch(state.apiBase + endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (res.status === 330 && !isRetry) {
    try {
      const json = await res.json();
      const host = json['X-Apple-MMe-Host'];
      if (host) {
        state.apiBase = `https://${host}/${state.TOKEN}/sharedstreams/`;
        return icloudPost(endpoint, body, true);
      }
    } catch (_) {}
  }

  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return res.json();
}

export async function ensureUrls(guids) {
  const needed = guids.filter(g => !state.urlCache[g]);
  if (!needed.length) return;

  const result = await icloudPost('webasseturls', { photoGuids: needed });
  const items  = result.items || {};

  for (const guid of needed) {
    const photo  = state.allPhotos.find(p => p.photoGuid === guid);
    if (!photo) continue;
    const derivs = photo.derivatives || {};

    const buildUrl = (key) => {
      if (!key) return null;
      const checksum = derivs[key]?.checksum;
      const loc      = items[checksum];
      if (!checksum || !loc) return null;
      return `https://${loc.url_location}${loc.url_path}`;
    };

    const isImage = (url) => url && !/\.(mp4|mov|m4v)/i.test(url.split('?')[0]);

    const keys = Object.keys(derivs)
      .filter(k => derivs[k]?.checksum)
      .sort((a, b) =>
        (derivs[a].width || 0) * (derivs[a].height || 0) -
        (derivs[b].width || 0) * (derivs[b].height || 0)
      );

    const isVid    = photo.mediaAssetType === 'video';
    const thumbKey = keys.find(k => isImage(buildUrl(k))) ?? keys[0];
    const fullKey  = isVid
      ? (keys.find(k => !isImage(buildUrl(k))) ?? keys[keys.length - 1])
      : keys[keys.length - 1];

    state.urlCache[guid] = {
      thumb:   buildUrl(thumbKey),
      full:    buildUrl(fullKey),
      isVideo: isVid,
    };
  }
}
