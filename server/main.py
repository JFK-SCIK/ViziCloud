import os
import httpx
from fastapi import FastAPI, Request, Response
from fastapi.staticfiles import StaticFiles

app = FastAPI()

TOKEN        = "B0SJtdOXmeCgIG"
ICLOUD_BASE  = f"https://p123-sharedstreams.icloud.com/{TOKEN}/sharedstreams/"
STATIC_DIR   = os.path.join(os.path.dirname(__file__), "..")


@app.post("/api/{endpoint}")
async def proxy_icloud(endpoint: str, request: Request):
    body = await request.body()
    base = ICLOUD_BASE

    async with httpx.AsyncClient(follow_redirects=False, timeout=20.0) as client:
        headers = {"Content-Type": "application/json"}
        res = await client.post(base + endpoint, content=body, headers=headers)

        # iCloud renvoie 330 pour indiquer le vrai serveur à utiliser
        if res.status_code == 330:
            try:
                data = res.json()
                new_host = data.get("X-Apple-MMe-Host")
                if new_host:
                    base = f"https://{new_host}/{TOKEN}/sharedstreams/"
                    res = await client.post(base + endpoint, content=body, headers=headers)
            except Exception:
                pass

    return Response(
        content=res.content,
        status_code=res.status_code,
        media_type="application/json",
    )


# Fichiers statiques servis en dernier (ne pas mettre avant les routes API)
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
