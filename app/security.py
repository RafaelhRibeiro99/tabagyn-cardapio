from argon2 import PasswordHasher
from fastapi import Request, HTTPException
ph = PasswordHasher()

def hash_password(password: str) -> str:
    return ph.hash(password)

def verify_password(password: str, hashed: str) -> bool:
    try:
        return ph.verify(hashed, password)
    except Exception:
        return False

def current_user(request: Request):
    return request.session.get("user")

def require_login(request: Request):
    user = current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Não autenticado")
    return user

def require_admin(request: Request):
    user = require_login(request)
    if user.get("role") != "ADMINISTRADOR":
        raise HTTPException(status_code=403, detail="Acesso restrito")
    return user
