#!/bin/bash
# setup.sh — à exécuter une seule fois sur la VM CrapKa
# Usage : bash ~/ViziCloud/server/setup.sh
set -e

REPO_DIR="$HOME/ViziCloud"
SERVICE="vizicloud"
PORT=8002

echo "=== ViziCloud — setup ==="

# 1. Cloner ou mettre à jour le repo
if [ -d "$REPO_DIR/.git" ]; then
    echo "[1/5] Mise à jour du repo..."
    cd "$REPO_DIR" && git pull origin main
else
    echo "[1/5] Clonage du repo..."
    git clone https://github.com/JFK-SCIK/ViziCloud.git "$REPO_DIR"
fi

# 2. Créer le venv Python et installer les dépendances
echo "[2/5] Installation des dépendances Python..."
cd "$REPO_DIR/server"
python3 -m venv venv
venv/bin/pip install -q --upgrade pip
venv/bin/pip install -q -r requirements.txt

# 3. Créer le service systemd
echo "[3/5] Création du service systemd..."
sudo tee /etc/systemd/system/$SERVICE.service > /dev/null << EOF
[Unit]
Description=ViziCloud PWA Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$REPO_DIR
ExecStart=$REPO_DIR/server/venv/bin/uvicorn server.main:app --host 127.0.0.1 --port $PORT
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable $SERVICE
sudo systemctl restart $SERVICE
echo "    Service $SERVICE démarré sur le port $PORT"

# 4. Vérifier que le service tourne
sleep 2
if systemctl is-active --quiet $SERVICE; then
    echo "[4/5] Service actif ✓"
else
    echo "[4/5] ERREUR : service non démarré. Vérifiez : journalctl -u $SERVICE -n 30"
    exit 1
fi

# 5. Config Caddy à ajouter manuellement
echo ""
echo "[5/5] Ajoutez ce bloc dans /etc/caddy/Caddyfile :"
echo "──────────────────────────────────────────────"
echo "vizicloud.duckdns.org {"
echo "    reverse_proxy 127.0.0.1:$PORT"
echo "}"
echo "──────────────────────────────────────────────"
echo "Puis : sudo systemctl reload caddy"
echo ""
echo "=== Setup terminé ! ==="
