# ViziCloud — Document de référence projet

## Vue d'ensemble

PWA installable pour visualiser un album photo iCloud partagé depuis Android et PC.
Hébergée sur GitHub Pages, proxifiée par un serveur FastAPI sur GCP.

- **GitHub repo** : https://github.com/JFK-SCIK/ViziCloud
- **GitHub Pages** : https://jfk-scik.github.io/ViziCloud/
- **Serveur proxy** : https://vizicloud.duckdns.org (GCP vm-crapka-1, e2-micro, 30 Go)
- **Album iCloud** : token `B0SJtdOXmeCgIG` (configurable via `albums.json`)

---

## État actuel (mai 2026)

### Stack
- HTML/CSS/JS vanilla avec ES modules natifs (`type="module"`) — pas de build, pas de framework
- FastAPI (`server/main.py`) : proxy iCloud + serveur de fichiers statiques
- Caddy : reverse proxy HTTPS avec Let's Encrypt
- GitHub Actions : génère `version.json` (hash commit) à chaque push sur `main`
- Service worker (`sw.js`) : cache offline basique, bypass appels iCloud et POST

### Fonctionnalités implémentées
- Galerie grille responsive (2/3/4 colonnes selon écran)
- Scroll infini par batch de 30 (IntersectionObserver)
- Lightbox : navigation prev/next, swipe tactile, clavier
- Swipe inhibé quand image zoomée (`visualViewport.scale`)
- Lecture vidéo dans la lightbox (`<video>` auto-détecté)
- Téléchargement photo/vidéo
- Bouton retour dans lightbox + bouton Android back (History API)
- Gestion du 330 redirect iCloud (côté proxy)
- Multi-albums via `albums.json` + sélecteur dans le header
- Filtres dans le panneau paramètres (⚙️) :
  - Par contributeur (`contributorFullName`)
  - Par période (mois+année, depuis `dateCreated` ISO)
- Référence commit affichée dans le header (depuis `version.json`)
- Panneau paramètres slide-in avec back Android
- Détection `dateCreated` ISO string vs timestamp numérique (`toDate()`)
- Badge point bleu sur ⚙️ quand filtre actif

### Fichiers clés
```
index.html          — shell HTML pur (~68 lignes)
admin.html          — interface admin (gestion albums, déploiement)
manifest.json       — config PWA (standalone, dark theme, vizir icon)
sw.js               — service worker
albums.json         — liste des albums iCloud configurables
css/
  app.css           — styles partagés index.html + admin.html
js/
  config.js         — PAGE_SIZE, USE_PROXY
  state.js          — état global (allPhotos, filteredPhotos, urlCache, activeFilters…)
  ui.js             — showToast, setLoading, toDate, formatDate
  api.js            — icloudPost, ensureUrls
  album.js          — loadAlbumConfig, TOKEN, apiBase
  gallery.js        — appendBatch, setupScrollObserver
  filter.js         — applyFilter, buildFilterUI
  lightbox.js       — openLightbox, closeLightbox, loadLbPhoto, swipe, events
  settings.js       — openSettings, closeSettings, events
  version.js        — checkVersion, doUpdate, startVersionPolling
  app.js            — init(), boot, events global
server/
  main.py           — FastAPI proxy iCloud + static files + admin API
  requirements.txt  — fastapi, uvicorn, httpx, aiofiles
  setup.sh          — setup VM (venv, systemd, Caddy config)
icons/
  icon.svg          — icône vizir (SVG, CSS classes)
  icon-192.png      — PNG PWA
  icon-512.png      — PNG PWA
ViziCloud_icon.svg  — icône maître (vizir louche, nuage iCloud, barbe)
tools/
  gen_icons.py      — génère PNG depuis SVG (svglib + Pillow)
  venv/             — env Python isolé pour les outils
.github/workflows/
  pages.yml         — CI GitHub Pages (génère version.json, déploie)
```

### Architecture actuelle
```
Navigateur
    │
    ├── GitHub Pages ──► index.html, css/, js/, sw.js, manifest.json, albums.json, version.json
    │   (USE_PROXY=false — iCloud appelé directement, Apple whitelist)
    │
    └── vizicloud.duckdns.org (Caddy)
            │   (USE_PROXY=true — proxy FastAPI)
            └── FastAPI :8002
                    ├── GET  /                           → fichiers statiques (StaticFiles)
                    ├── POST /api/{token}/webstream      → proxy iCloud
                    ├── POST /api/{token}/webasseturls   → proxy iCloud
                    ├── GET  /version.json               → git rev-parse HEAD
                    ├── GET  /albums.json                → liste albums (server/data/)
                    ├── GET  /admin                      → admin.html
                    ├── GET|POST /admin/*                → CRUD albums, deploy, logs
                    └── (iCloud sert les images directement au navigateur)
```

---

## API iCloud — Notes techniques

- `POST /webstream { streamCtag: null }` → liste des photos
- `POST /webasseturls { photoGuids: [...] }` → URLs des assets (expirent en quelques heures)
- Redirect 330 : réponse `{ "X-Apple-MMe-Host": "pXX-..." }` → relancer vers le bon host
- `dateCreated` : chaîne ISO 8601 (`"2024-01-15T10:30:00Z"`), **pas** un timestamp secondes
- Derivatives : `items[checksum]` (clé = checksum, pas guid)
- URLs pré-signées dans `url_path` (pas besoin de `?fingerprint=`)
- `contributorFullName` disponible dans `webstream`, pas d'EXIF (appareil, GPS) dans la réponse JSON

---

## Roadmap

### Prochaine étape : Stratégie B — Cache serveur

### Stratégie B — Cache serveur (à implémenter)

**Objectif** : ne plus dépendre des URLs iCloud qui expirent ; enrichir les métadonnées
depuis l'EXIF des photos (modèle d'appareil, GPS, orientation…).

**Principe :**
1. Le serveur FastAPI télécharge chaque photo une fois en arrière-plan
2. Il extrait l'EXIF avec Pillow/exifread
3. Il génère un thumbnail redimensionné (~400px) et le stocke sur disque
4. Les métadonnées enrichies sont stockées dans SQLite (`photos.db`)
5. Le client appelle `/thumb/{guid}` et `/meta` au lieu de l'API iCloud

**Nouveaux endpoints FastAPI :**
```
GET  /thumb/{guid}          → thumbnail stable (disque ou iCloud en fallback)
GET  /meta                  → JSON complet de tous les photos avec EXIF
POST /sync                  → déclenche une synchronisation manuelle
```

**Nouveaux filtres rendus possibles :**
- Modèle d'appareil (iPhone 15, Canon EOS…)
- Localisation (GPS → future vue carte)
- Orientation portrait/paysage
- Résolution

**Dimensionnement VM (e2-micro, 30 Go, 1 Go RAM) :**
- 4000 thumbs × 50 Ko ≈ 200 Mo → OK
- SQLite métadonnées ≈ quelques Mo → OK
- Indexation initiale : tâche de fond lente (pauses entre chaque photo) pour ne pas étouffer CrapKa
- Service courant : léger (lecture SQLite + fichiers statiques)

**Structure fichiers côté VM :**
```
~/ViziCloud/
  server/
    photos.db           — SQLite (guid, exif, thumb_path, sync_date…)
    thumbs/             — miniatures {guid}.jpg
    indexer.py          — tâche d'indexation en arrière-plan
```

### Stratégie IA — Reconnaissance faciale (futur)

**Contexte :** la reconnaissance faciale sera développée dans le projet **PhoSy**
(collection photo perso sur PC + disques externes). PhoSy disposera d'un serveur
local sur le PC de l'utilisateur, allumable à la demande, avec les ressources CPU/RAM
suffisantes (et potentiellement GPU).

**Intégration avec ViziCloud :**
- PhoSy reconnaît les visages sur les photos iCloud (téléchargées une fois)
- Il produit `faces.json` : `{ "guid_icloud": ["Prénom1", "Prénom2"] }`
- Ce JSON est pushé vers la VM ViziCloud (API d'import ou rsync)
- SQLite `photos.db` reçoit une colonne `faces` JSON
- ViziCloud expose un filtre "Qui est sur la photo"

**Pourquoi ne pas faire la reco sur la VM :**
- e2-micro : 1 Go RAM, CPU burstable partagé → insuffisant pour dlib/face_recognition
- Le modèle dlib seul nécessite ~500 Mo RAM, incompatible avec les autres services

**Identifiant commun :** `photoGuid` iCloud (présent dans les deux systèmes si PhoSy
télécharge depuis l'album partagé) ou hash MD5 du fichier si photo dans les deux collections.

---

## Décisions techniques prises

| Décision | Raison |
|----------|--------|
| Vanilla JS, pas de framework | Pas de build, déploiement immédiat sur GitHub Pages |
| Proxy FastAPI côté serveur | CORS iCloud bloque les requêtes navigateur direct |
| `dateCreated` parsé comme ISO string | L'API retourne une chaîne, pas un timestamp secondes |
| Scroll infini plutôt que pagination | UX mobile nettement meilleure |
| `filteredPhotos` comme vue séparée | Filtres combinables sans recharger depuis iCloud |
| History API pour back Android | Le bouton retour système ferme lightbox/settings |
| `visualViewport.scale` pour inhiber swipe | Évite changement de photo lors du zoom pinch |
