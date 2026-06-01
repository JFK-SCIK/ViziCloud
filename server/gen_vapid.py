#!/usr/bin/env python3
"""Run once on the VM to generate VAPID keys for Web Push.
   python3 server/gen_vapid.py
"""
import base64
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import (
    Encoding, PublicFormat, PrivateFormat, NoEncryption
)

DATA_DIR = Path(__file__).parent / 'data'
DATA_DIR.mkdir(exist_ok=True)

key = ec.generate_private_key(ec.SECP256R1())
priv_pem = key.private_bytes(Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption())
pub_raw  = key.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
pub_b64  = base64.urlsafe_b64encode(pub_raw).rstrip(b'=').decode()

(DATA_DIR / 'vapid_private.pem').write_bytes(priv_pem)
(DATA_DIR / 'vapid_public.txt').write_text(pub_b64)

print('VAPID keys generated.')
print(f'Public key : {pub_b64}')
print('Files saved in server/data/')
print()
print('Next: sudo systemctl restart vizicloud')
