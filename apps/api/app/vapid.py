"""Generate a web push key pair: python -m app.vapid

Put the two values in the API's environment (WB_VAPID_PUBLIC_KEY, WB_VAPID_PRIVATE_KEY).
The public key is also what the browser uses as applicationServerKey.
"""

import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def generate() -> tuple[str, str]:
    key = ec.generate_private_key(ec.SECP256R1())
    private = key.private_numbers().private_value.to_bytes(32, "big")
    public = key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return b64(public), b64(private)


if __name__ == "__main__":
    pub, priv = generate()
    print(f"WB_VAPID_PUBLIC_KEY={pub}")
    print(f"WB_VAPID_PRIVATE_KEY={priv}")
