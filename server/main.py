import asyncio
import json
import os
import subprocess
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.responses import HTMLResponse, Response, JSONResponse
from fastapi.staticfiles import StaticFiles

IMPORT_DIR = Path(__file__).parent / 'data' / 'import'

ADMIN_PWD  = os.environ.get('VIZICLOUD_ADMIN_PWD',  '')
UPLOAD_PWD = os.environ.get('VIZICLOUD_UPLOAD_PWD', '')
BRANCH    = os.environ.get('VIZICLOUD_BRANCH',    'main')
SERVICE   = os.environ.get('VIZICLOUD_SERVICE',   'vizicloud')
REPO_DIR  = Path(__file__).parent.parent
DATA_DIR  = Path(__file__).parent / 'data'
DATA_DIR.mkdir(exist_ok=True)

# ── VAPID state ───────────────────────────────────────────────────────────────

_vapid_private_key: str | None = None
_vapid_public_key:  str | None = None


def _load_vapid():
    global _vapid_private_key, _vapid_public_key
    priv = DATA_DIR / 'vapid_private.pem'
    pub  = DATA_DIR / 'vapid_public.txt'
    if not priv.exists() or not pub.exists():
        try:
            _generate_vapid(priv, pub)
        except Exception:
            return  # pywebpush/cryptography absent — serveur démarre quand même
    if priv.exists() and pub.exists():
        _vapid_private_key = priv.read_text().strip()
        _vapid_public_key  = pub.read_text().strip()


def _generate_vapid(priv_path: Path, pub_path: Path):
    import base64
    from datetime import datetime, timezone
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
    key     = ec.generate_private_key(ec.SECP256R1())
    # Raw base64url scalar — pywebpush 2.x expects this, not PEM
    priv_b64 = base64.urlsafe_b64encode(
        key.private_numbers().private_value.to_bytes(32, 'big')
    ).rstrip(b'=').decode()
    pub_b64  = base64.urlsafe_b64encode(
        key.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    ).rstrip(b'=').decode()
    priv_path.write_text(priv_b64)
    pub_path.write_text(pub_b64)
    (DATA_DIR / 'vapid_meta.json').write_text(
        json.dumps({'generated_at': datetime.now(timezone.utc).isoformat()})
    )


# ── Subscriptions ─────────────────────────────────────────────────────────────

def _load_subscriptions() -> list:
    f = DATA_DIR / 'subscriptions.json'
    return json.loads(f.read_text()) if f.exists() else []


def _save_subscriptions(subs: list):
    (DATA_DIR / 'subscriptions.json').write_text(json.dumps(subs, indent=2))


# ── Stream state (ctag per album) ─────────────────────────────────────────────

def _load_stream_state() -> dict:
    f = DATA_DIR / 'stream_state.json'
    return json.loads(f.read_text()) if f.exists() else {}


def _save_stream_state(state: dict):
    (DATA_DIR / 'stream_state.json').write_text(json.dumps(state, indent=2))


# ── Push delivery ─────────────────────────────────────────────────────────────

async def _send_push(sub_info: dict, payload: dict) -> tuple[str, str]:
    """Returns ('ok'|'gone'|'error', detail_message)."""
    if not _vapid_private_key:
        return ('error', 'VAPID private key not loaded')
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        return ('error', 'pywebpush not installed')

    def _do():
        try:
            webpush(
                subscription_info=sub_info,
                data=json.dumps(payload),
                vapid_private_key=_vapid_private_key,
                vapid_claims={'sub': 'mailto:admin@vizicloud.app'},
                ttl=86400,
            )
            return ('ok', '')
        except Exception as exc:
            detail = str(exc)
            if hasattr(exc, 'response') and exc.response is not None:
                if exc.response.status_code == 410:
                    return ('gone', detail)
                detail = f'HTTP {exc.response.status_code}: {exc.response.text[:300]}'
            return ('error', detail)

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _do)


# ── Album polling ─────────────────────────────────────────────────────────────

async def _poll_albums():
    subs = _load_subscriptions()
    if not subs or not _vapid_private_key:
        return

    albums = _read_albums()
    stream_state = _load_stream_state()
    notifications = []

    for album in albums:
        token = album.get('id')
        if not token:
            continue
        try:
            base = f'https://p123-sharedstreams.icloud.com/{token}/sharedstreams/'
            body = json.dumps({'streamCtag': None}).encode()
            headers = {'Content-Type': 'application/json'}
            async with httpx.AsyncClient(follow_redirects=False, timeout=20.0) as client:
                res = await client.post(base + 'webstream', content=body, headers=headers)
                if res.status_code == 330:
                    data = res.json()
                    new_host = data.get('X-Apple-MMe-Host')
                    if new_host:
                        base = f'https://{new_host}/{token}/sharedstreams/'
                        res = await client.post(base + 'webstream', content=body, headers=headers)
                if not res.is_success:
                    continue
                data = res.json()

            new_ctag  = data.get('streamCtag', '')
            new_count = len(data.get('photos', []))
            old       = stream_state.get(token, {})
            old_ctag  = old.get('ctag', '')
            old_count = old.get('count', 0)

            if old_ctag and new_ctag != old_ctag and new_count > old_count:
                diff = new_count - old_count
                name = album.get('name', 'ViziCloud')
                notifications.append({
                    'title': f'ViziCloud — {name}',
                    'body':  f'{diff} nouvelle{"s" if diff > 1 else ""} photo{"s" if diff > 1 else ""} !',
                    'count': diff,
                    'token': token,
                })

            stream_state[token] = {'ctag': new_ctag, 'count': new_count}

        except Exception:
            pass

    _save_stream_state(stream_state)

    if not notifications:
        return

    dead = set()
    for i, sub in enumerate(subs):
        for notif in notifications:
            result, _ = await _send_push(sub, notif)
            if result == 'gone':
                dead.add(i)
                break

    if dead:
        _save_subscriptions([s for i, s in enumerate(subs) if i not in dead])


async def _polling_loop():
    await asyncio.sleep(30)
    while True:
        try:
            await _poll_albums()
        except Exception:
            pass
        await asyncio.sleep(10 * 60)


# ── App lifecycle ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    IMPORT_DIR.mkdir(parents=True, exist_ok=True)
    _load_vapid()
    asyncio.create_task(_polling_loop())
    yield


app = FastAPI(lifespan=lifespan)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _check_admin(pwd: str):
    if ADMIN_PWD and pwd != ADMIN_PWD:
        raise HTTPException(status_code=403, detail='Mot de passe incorrect')


def _read_albums():
    data_file = DATA_DIR / 'albums.json'
    if data_file.exists():
        return json.loads(data_file.read_text(encoding='utf-8'))
    repo_file = REPO_DIR / 'albums.json'
    if repo_file.exists():
        albums = json.loads(repo_file.read_text(encoding='utf-8'))
        data_file.write_text(json.dumps(albums, indent=2, ensure_ascii=False), encoding='utf-8')
        return albums
    return [{'id': 'B0SJtdOXmeCgIG', 'default': True}]


def _save_albums(albums):
    (DATA_DIR / 'albums.json').write_text(
        json.dumps(albums, indent=2, ensure_ascii=False) + '\n', encoding='utf-8'
    )


def _launch_deploy():
    log = open(DATA_DIR / 'deploy.log', 'w')
    script = f'cd {REPO_DIR} && git pull origin {BRANCH} && sudo systemctl restart {SERVICE}'
    subprocess.Popen(['bash', '-c', script], start_new_session=True, stdout=log, stderr=log)


# ── Push endpoints ────────────────────────────────────────────────────────────

@app.get('/push/vapid-public-key')
async def get_vapid_public_key():
    if not _vapid_public_key:
        raise HTTPException(status_code=503, detail='VAPID non configuré — exécuter gen_vapid.py')
    meta_path = DATA_DIR / 'vapid_meta.json'
    generated_at = None
    if meta_path.exists():
        try:
            generated_at = json.loads(meta_path.read_text()).get('generated_at')
        except Exception:
            pass
    return {'key': _vapid_public_key, 'generated_at': generated_at}


@app.post('/push/subscribe')
async def push_subscribe(request: Request):
    if not _vapid_public_key:
        raise HTTPException(status_code=503, detail='VAPID non configuré')
    sub = await request.json()
    subs = _load_subscriptions()
    if not any(s.get('endpoint') == sub.get('endpoint') for s in subs):
        subs.append(sub)
        _save_subscriptions(subs)
    return {'ok': True}


@app.delete('/push/subscribe')
async def push_unsubscribe(request: Request):
    sub = await request.json()
    subs = _load_subscriptions()
    subs = [s for s in subs if s.get('endpoint') != sub.get('endpoint')]
    _save_subscriptions(subs)
    return {'ok': True}


@app.post('/push/check')
async def push_check_now(pwd: str = ''):
    _check_admin(pwd)
    asyncio.create_task(_poll_albums())
    return {'ok': True}


@app.post('/admin/push/test')
async def admin_push_test(pwd: str = ''):
    _check_admin(pwd)
    if not _vapid_private_key:
        raise HTTPException(status_code=503, detail='VAPID non configuré')
    subs = _load_subscriptions()
    if not subs:
        raise HTTPException(status_code=400, detail='Aucun abonné enregistré')
    payload = {
        'title': 'ViziCloud — Test',
        'body':  'Notification de test envoyée depuis l\'admin.',
        'count': 1,
    }
    results = {'ok': 0, 'gone': 0, 'error': 0}
    errors = []
    dead = set()
    for i, sub in enumerate(subs):
        r, detail = await _send_push(sub, payload)
        results[r] += 1
        if r == 'gone':
            dead.add(i)
        elif r == 'error' and detail:
            errors.append(detail)
    if dead:
        _save_subscriptions([s for i, s in enumerate(subs) if i not in dead])
    return {'ok': True, 'results': results, 'total': len(subs), 'errors': errors}


@app.post('/admin/gen-vapid')
async def admin_gen_vapid(pwd: str = ''):
    _check_admin(pwd)
    priv = DATA_DIR / 'vapid_private.pem'
    pub  = DATA_DIR / 'vapid_public.txt'
    try:
        _generate_vapid(priv, pub)
        _load_vapid()
        _save_subscriptions([])  # old subs are tied to previous key
        return {'ok': True, 'public_key': _vapid_public_key}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/admin/push/status')
async def push_status(pwd: str = ''):
    _check_admin(pwd)
    subs  = _load_subscriptions()
    state = _load_stream_state()
    meta_path = DATA_DIR / 'vapid_meta.json'
    generated_at = None
    if meta_path.exists():
        try:
            generated_at = json.loads(meta_path.read_text()).get('generated_at')
        except Exception:
            pass
    sub_list = [
        {'endpoint_short': s.get('endpoint', '')[-40:]}
        for s in subs
    ]
    return {
        'vapid_ready':    bool(_vapid_public_key),
        'vapid_public_key': _vapid_public_key,
        'vapid_generated_at': generated_at,
        'subscriptions':  len(subs),
        'sub_list':       sub_list,
        'albums_state':   {t: s.get('count', 0) for t, s in state.items()},
    }


# ── iCloud proxy ──────────────────────────────────────────────────────────────

@app.post('/api/{token}/{endpoint}')
async def proxy_icloud(token: str, endpoint: str, request: Request):
    body = await request.body()
    base = f'https://p123-sharedstreams.icloud.com/{token}/sharedstreams/'

    async with httpx.AsyncClient(follow_redirects=False, timeout=20.0) as client:
        headers = {'Content-Type': 'application/json'}
        res = await client.post(base + endpoint, content=body, headers=headers)

        if res.status_code == 330:
            try:
                data = res.json()
                new_host = data.get('X-Apple-MMe-Host')
                if new_host:
                    base = f'https://{new_host}/{token}/sharedstreams/'
                    res = await client.post(base + endpoint, content=body, headers=headers)
            except Exception:
                pass

    return Response(content=res.content, status_code=res.status_code, media_type='application/json')


# ── Version ───────────────────────────────────────────────────────────────────

@app.get('/version.json')
async def get_version():
    try:
        sha = subprocess.check_output(
            ['git', '-C', str(REPO_DIR), 'rev-parse', '--short', 'HEAD'],
            text=True, stderr=subprocess.DEVNULL,
        ).strip()
        return {'commit': sha}
    except Exception:
        return {'commit': '?'}


# ── Albums ────────────────────────────────────────────────────────────────────

@app.get('/albums.json')
async def serve_albums():
    return _read_albums()


# ── Admin ─────────────────────────────────────────────────────────────────────

@app.get('/admin', response_class=HTMLResponse)
async def admin_page(pwd: str = ''):
    if ADMIN_PWD and pwd != ADMIN_PWD:
        raise HTTPException(status_code=403, detail='Mot de passe incorrect')
    return HTMLResponse((REPO_DIR / 'admin.html').read_text(encoding='utf-8'))


@app.get('/admin/info')
async def admin_info(pwd: str = ''):
    _check_admin(pwd)
    try:
        local = subprocess.check_output(
            ['git', '-C', str(REPO_DIR), 'log', '-1', '--format=%h|%s|%ai'],
            text=True, stderr=subprocess.DEVNULL,
        ).strip()
        sha, msg, date = local.split('|', 2)
    except Exception:
        sha, msg, date = '?', '?', '?'
    return {'sha': sha, 'message': msg, 'date': date}


@app.get('/admin/albums')
async def admin_get_albums(pwd: str = ''):
    _check_admin(pwd)
    return _read_albums()


@app.post('/admin/albums')
async def admin_save_albums(request: Request, pwd: str = ''):
    _check_admin(pwd)
    albums = await request.json()
    _save_albums(albums)
    return {'ok': True}


@app.post('/deploy/now')
async def deploy_now(pwd: str = ''):
    _check_admin(pwd)
    try:
        subprocess.check_call(
            ['git', '-C', str(REPO_DIR), 'fetch', 'origin', BRANCH],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10,
        )
        behind = subprocess.check_output(
            ['git', '-C', str(REPO_DIR), 'log', f'HEAD..origin/{BRANCH}', '--oneline'],
            text=True, stderr=subprocess.DEVNULL,
        ).strip()
        if not behind:
            return {'ok': True, 'up_to_date': True}
    except Exception:
        pass
    _launch_deploy()
    return {'ok': True, 'up_to_date': False}


@app.get('/admin/deploy/log')
async def deploy_log(pwd: str = ''):
    _check_admin(pwd)
    log_path = DATA_DIR / 'deploy.log'
    if log_path.exists():
        return {'log': log_path.read_text(encoding='utf-8', errors='replace')}
    return {'log': ''}


# ── Upload / import ───────────────────────────────────────────────────────────

UPLOAD_ALLOWED_MIME = {
    'image/jpeg', 'image/png', 'image/heic', 'image/heif',
    'image/gif', 'image/webp', 'image/tiff',
    'video/mp4', 'video/quicktime', 'video/x-m4v',
}
UPLOAD_MAX_BYTES = 200 * 1024 * 1024  # 200 MB


def _check_upload_auth(pwd: str):
    if UPLOAD_PWD and pwd != UPLOAD_PWD:
        raise HTTPException(status_code=403, detail='Mot de passe incorrect')


@app.post('/upload')
async def upload_file(file: UploadFile = File(...), pwd: str = ''):
    _check_upload_auth(pwd)
    if file.content_type and file.content_type not in UPLOAD_ALLOWED_MIME:
        raise HTTPException(status_code=415, detail=f'Type non supporté : {file.content_type}')
    safe_name = Path(file.filename or 'upload').name
    dest = IMPORT_DIR / safe_name
    # avoid collisions
    stem = dest.stem
    suffix = dest.suffix
    counter = 1
    while dest.exists():
        dest = IMPORT_DIR / f'{stem}_{counter}{suffix}'
        counter += 1
    total = 0
    with dest.open('wb') as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > UPLOAD_MAX_BYTES:
                dest.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail='Fichier trop volumineux (max 200 Mo)')
            out.write(chunk)
    return {'ok': True, 'filename': dest.name, 'size': total}


@app.get('/import/pending')
async def import_pending(pwd: str = ''):
    _check_upload_auth(pwd)
    files = [
        {'filename': f.name, 'size': f.stat().st_size}
        for f in sorted(IMPORT_DIR.iterdir(), key=lambda p: p.stat().st_mtime)
        if f.is_file()
    ]
    return {'files': files}


@app.delete('/import/{filename}')
async def import_delete(filename: str, pwd: str = ''):
    _check_upload_auth(pwd)
    target = IMPORT_DIR / Path(filename).name  # strip any path traversal
    if not target.exists():
        raise HTTPException(status_code=404, detail='Fichier introuvable')
    target.unlink()
    return {'ok': True}


# ── Static files (last) ───────────────────────────────────────────────────────

app.mount('/', StaticFiles(directory=str(REPO_DIR), html=True), name='static')
