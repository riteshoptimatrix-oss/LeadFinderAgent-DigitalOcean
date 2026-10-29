import base64
from cryptography.fernet import Fernet
from app.core.config import settings

def get_fernet() -> Fernet:
    # Use SECRET_KEY, ensure it's 32 url-safe base64 bytes for Fernet
    # If not, we hash it to fit the requirement
    import hashlib
    key_hash = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    fernet_key = base64.urlsafe_b64encode(key_hash)
    return Fernet(fernet_key)

def encrypt_string(plain_text: str) -> str:
    if not plain_text:
        return plain_text
    f = get_fernet()
    return f.encrypt(plain_text.encode()).decode()

def decrypt_string(cipher_text: str) -> str:
    if not cipher_text:
        return cipher_text
    f = get_fernet()
    try:
        return f.decrypt(cipher_text.encode()).decode()
    except Exception:
        # If decryption fails (e.g. was plaintext before we added encryption), return as-is
        return cipher_text
