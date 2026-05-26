#!/bin/bash
# setup.sh — à exécuter une seule fois sur la VM
# Usage : VIZICLOUD_ADMIN_PWD=ton_mot_de_passe bash ~/ViziCloud/server/setup.sh
set -e

REPO_DIR="$HOME/ViziCloud"
SERVICE="vizicloud"
PORT=8002

echo "=== ViziCloud — setup ==="

if [ -z "$VIZICLOUD_ADMIN_PWD" ]; then
    echo "ERREUR : définir VIZICLOUD_ADMIN_PWD avant de lancer ce script."
    echo "  VIZICLOUD_ADMIN_PWD=mon_mdp bash server/setup.sh"
    exit 1
fi

# 1. Cloner ou mettre à jour le repo
if [ -d "$REPO_DIR/.git" ]; then
    echo "[1/6] Mise à jour du repo..."
    cd "$REPO_DIR" && git pull origin main
else
    echo "[1/6] Clonage du repo..."
    git clone https://github.com/JFK-SCIK/ViziCloud.git "$REPO_DIR"
fi

# 2. Créer le venv Python et installer les dépendances
echo "[2/6] Installation des dépendances Python..."
cd "$REPO_DIR/server"
python3 -m venv venv
venv/bin/pip install -q --upgrade pip
venv/bin/pip install -q -r requirements.txt

# 3. Créer le répertoire de données (gitignored)
echo "[3/6] Création du répertoire de données..."
mkdir -p "$REPO_DIR/server/data"

# 4. Créer le service systemd
echo "[4/6] Création du service systemd..."
sudo tee /etc/systemd/system/$SERVICE.service > /dev/null << EOF
[Unit]
Description=ViziCloud PWA Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$REPO_DIR/server
ExecStart=$REPO_DIR/server/venv/bin/uvicorn main:app --host 127.0.0.1 --port $PORT
Restart=always
RestartSec=5
Environment=VIZICLOUD_ADMIN_PWD=${VIZICLOUD_ADMIN_PWD}
Environment=VIZICLOUD_BRANCH=main
Environment=VIZICLOUD_SERVICE=${SERVICE}

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable $SERVICE
sudo systemctl restart $SERVICE
echo "    Service $SERVICE démarré sur le port $PORT"

# 5. Sudoers — deploy sans mot de passe
echo "[5/6] Sudoers — restart sans mot de passe..."
echo "$USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart ${SERVICE}" \
    | sudo tee /etc/sudoers.d/vizicloud-deploy > /dev/null
sudo chmod 440 /etc/sudoers.d/vizicloud-deploy

# 6. Vérifier que le service tourne
sleep 2
if systemctl is-active --quiet $SERVICE; then
    echo "[6/6] Service actif ✓"
else
    echo "[6/6] ERREUR : service non démarré. Vérifiez : journalctl -u $SERVICE -n 30"
    exit 1
fi

echo ""
echo "=== Setup terminé ! ==="
echo ""
echo "Page admin : http://localhost:${PORT}/admin?pwd=<votre_mot_de_passe>"
echo ""
echo "Ajoutez ce bloc dans /etc/caddy/Caddyfile :"
echo "──────────────────────────────────────────────"
echo "vizicloud.duckdns.org {"
echo "    reverse_proxy 127.0.0.1:$PORT"
echo "}"
echo "──────────────────────────────────────────────"
echo "Puis : sudo systemctl reload caddy"
