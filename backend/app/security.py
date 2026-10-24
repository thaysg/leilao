from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, Request
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .errors import ApiError
from .models import User


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user: User) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode({"sub": str(user.id), "exp": exp}, settings.secret_key, algorithm="HS256")


def _user_from_request(request: Request, db: Session) -> User | None:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    try:
        payload = jwt.decode(header[7:], settings.secret_key, algorithms=["HS256"])
        return db.get(User, int(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    return _user_from_request(request, db)


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user = _user_from_request(request, db)
    if not user:
        raise ApiError("unauthorized", "Faça login para continuar.", 401)
    return user


def require_role(role: str):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role != role:
            who = "leiloeiros" if role == "seller" else "licitantes"
            raise ApiError("forbidden", f"Esta ação é exclusiva para {who}.", 403)
        return user
    return dep
