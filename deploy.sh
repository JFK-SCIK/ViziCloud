#!/bin/bash
# deploy.sh — à exécuter sur la VM CrapKa pour mettre à jour ViziCloud
# Usage : cd ~/ViziCloud && bash deploy.sh
set -e

cd ~/ViziCloud
git pull origin main
source server/venv/bin/activate 2>/dev/null || true
pip install -q -r server/requirements.txt
sudo systemctl restart vizicloud
echo "ViziCloud déployé ✓"
