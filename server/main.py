import json
import os
import subprocess
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles

app = FastAPI()

ADMIN_PWD = os.environ.get('VIZICLOUD_ADMIN_PWD', '')
BRANCH    = os.environ.get('VIZICLOUD_BRANCH',    'main')
SERVICE   = os.environ.get('VIZICLOUD_SERVICE',   'vizicloud')
REPO_DIR  = Path(__file__).parent.parent
DATA_DIR  = Path(__file__).parent / 'data'
DATA_DIR.mkdir(exist_ok=True)


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


# ── Albums (public — lu par index.html) ──────────────────────────────────────

@app.get('/albums.json')
async def serve_albums():
    return _read_albums()


# ── Page admin ───────────────────────────────────────────────────────────────

@app.get('/admin', response_class=HTMLResponse)
async def admin_page(pwd: str = ''):
    if ADMIN_PWD and pwd != ADMIN_PWD:
        raise HTTPException(status_code=403, detail='Mot de passe incorrect')
    return HTMLResponse((REPO_DIR / 'admin.html').read_text(encoding='utf-8'))


# ── Admin : infos git ─────────────────────────────────────────────────────────

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


# ── Admin : albums CRUD ───────────────────────────────────────────────────────

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


# ── Admin : déploiement ───────────────────────────────────────────────────────

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


# ── Fichiers statiques (en dernier) ──────────────────────────────────────────

app.mount('/', StaticFiles(directory=str(REPO_DIR), html=True), name='static')
