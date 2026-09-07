"""Small, self-hosted menu: SQLite catalog, private editor and WhatsApp orders."""
import io
import json
import os
import secrets
import sqlite3
import threading
import time
import uuid
import warnings
from collections import defaultdict
from contextlib import asynccontextmanager, contextmanager
from decimal import Decimal, InvalidOperation
from pathlib import Path

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Form, File, UploadFile, HTTPException, Depends
from fastapi.responses import FileResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from PIL import Image, UnidentifiedImageError
from starlette.middleware.sessions import SessionMiddleware

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
DATA = Path(os.getenv("DATA_DIR", str(ROOT / "data"))).resolve()
DATA.mkdir(parents=True, exist_ok=True)
UPLOADS = DATA / "uploads"
UPLOADS.mkdir(exist_ok=True)
DATABASE = DATA / "catalog.sqlite3"
CATEGORIES = ("Sessões", "Bebidas", "Drinks", "Esquine", "Doces")
ph = PasswordHasher()
Image.MAX_IMAGE_PIXELS = 20_000_000
templates = Jinja2Templates(directory=ROOT / "app" / "templates")


@contextmanager
def database():
    connection = sqlite3.connect(DATABASE, timeout=15)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def initialize():
    with database() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS admins (
                username TEXT PRIMARY KEY, password_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK(id=1), whatsapp TEXT NOT NULL,
                demonstration INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL,
                description TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>=0),
                available INTEGER NOT NULL DEFAULT 1, image TEXT
            );
            CREATE TABLE IF NOT EXISTS essences (
                id TEXT PRIMARY KEY, brand TEXT NOT NULL, flavor TEXT NOT NULL,
                available INTEGER NOT NULL DEFAULT 1, image TEXT
            );
            CREATE TABLE IF NOT EXISTS essence_sessions (
                essence_id TEXT NOT NULL, product_id TEXT NOT NULL,
                PRIMARY KEY(essence_id, product_id)
            );
        """)
        if not db.execute("SELECT 1 FROM settings WHERE id=1").fetchone():
            # Seed only a new catalog; never replace existing store data.
            seed_path = ROOT / "app" / "catalog_seed.json"
            seed = json.loads(seed_path.read_text(encoding="utf-8"))
            db.execute("INSERT INTO settings VALUES(1, ?, ?)", (seed["whatsapp"], int(seed["demonstracao"])))
            categories = {c["id"]: c["nome"] for c in seed["categorias"]}
            for p in seed["produtos"]:
                db.execute("INSERT INTO products VALUES(?,?,?,?,?,?,NULL)",
                           (p["id"], categories[p["categoria"]], p["nome"], p["descricao"], p["preco"], int(p["disponivel"])))
        username = os.getenv("ADMIN_USERNAME", "").strip()
        password = os.getenv("ADMIN_PASSWORD", "")
        if username and password and not db.execute("SELECT 1 FROM admins").fetchone():
            db.execute("INSERT INTO admins VALUES (?, ?)", (username, ph.hash(password)))


def session_secret():
    configured = os.getenv("SECRET_KEY", "")
    if len(configured) >= 32:
        return configured
    secret_path = DATA / "session.key"
    if not secret_path.exists():
        try:
            with secret_path.open("x", encoding="utf-8") as output:
                output.write(secrets.token_urlsafe(48))
        except FileExistsError:
            pass
    return secret_path.read_text(encoding="utf-8")


@asynccontextmanager
async def lifespan(app):
    initialize()
    yield


app = FastAPI(title="TABAGYN", lifespan=lifespan, docs_url=None, redoc_url=None)
app.add_middleware(SessionMiddleware, secret_key=session_secret(),
                   session_cookie="tabagyn_admin", max_age=8*60*60,
                   same_site="lax", https_only=os.getenv("COOKIE_SECURE", "false").lower() == "true")
app.mount("/assets", StaticFiles(directory=ROOT / "docs"), name="assets")
app.mount("/uploads", StaticFiles(directory=UPLOADS), name="uploads")


@app.middleware("http")
async def headers(request, call_next):
    try:
        length = int(request.headers.get("content-length", "0"))
    except ValueError:
        return Response("Requisição inválida.", status_code=400)
    if length > 6 * 1024 * 1024:
        return Response("Envie uma foto de até 5 MB.", status_code=413)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' blob:; script-src 'self'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'"
    if request.url.path.startswith(("/admin", "/login")) or request.url.path in ("/", "/cardapio.js"):
        response.headers["Cache-Control"] = "no-store"
    return response


def csrf_token(request):
    if "csrf" not in request.session:
        request.session["csrf"] = secrets.token_urlsafe(32)
    return request.session["csrf"]


def verify_csrf(request, token):
    expected = request.session.get("csrf", "")
    if not expected or not secrets.compare_digest(expected, token):
        raise HTTPException(403, "A sessão expirou. Recarregue a página e tente novamente.")


def admin(request: Request):
    username = request.session.get("admin")
    with database() as db:
        valid = username and db.execute("SELECT 1 FROM admins WHERE username=?", (username,)).fetchone()
    if not valid:
        if request.url.path in {"/admin", "/admin/cadastros", "/admin/essencias"} and request.method == "GET":
            request.session["next"] = request.url.path
        raise HTTPException(303, headers={"Location": "/login"})
    return username


def page(request, **context):
    with database() as db:
        products = db.execute("SELECT * FROM products ORDER BY category, name").fetchall()
        settings = db.execute("SELECT * FROM settings WHERE id=1").fetchone()
    return templates.TemplateResponse(request=request, name="manage.html", context={
        "products": products, "settings": settings, "categories": CATEGORIES, "csrf": csrf_token(request), **context})


@app.get("/")
def menu():
    return FileResponse(ROOT / "docs" / "index.html")


@app.get("/style.css")
def stylesheet():
    return FileResponse(ROOT / "docs" / "style.css")


@app.get("/app.js")
def javascript():
    return FileResponse(ROOT / "docs" / "app.js")


@app.get("/cardapio.js")
def catalog():
    with database() as db:
        settings = db.execute("SELECT * FROM settings WHERE id=1").fetchone()
        products = db.execute("SELECT * FROM products ORDER BY category, name").fetchall()
        essences = db.execute("SELECT * FROM essences WHERE available=1 ORDER BY brand,flavor").fetchall()
        links = db.execute("SELECT * FROM essence_sessions").fetchall()
    categories = CATEGORIES
    products = [p for p in products if p["category"] in categories]
    ids = {category: str(i) for i, category in enumerate(categories)}
    data = {"whatsapp": settings["whatsapp"], "demonstracao": bool(settings["demonstration"]),
            "categorias": [{"id": ids[c], "nome": c, "descricao": ""} for c in categories],
            "produtos": [{"id": p["id"], "categoria": ids[p["category"]], "nome": p["name"],
                          "descricao": p["description"], "preco": p["price"], "disponivel": bool(p["available"]),
                          "sessao": p["category"] == "Sessões",
                          "imagem": f'/uploads/{p["image"]}' if p["image"] else None} for p in products]}
    session_ids = {p["id"] for p in products if p["category"] == "Sessões"}
    data["essencias"] = [{"id": e["id"], "marca": e["brand"], "sabor": e["flavor"],
                          "imagem": f'/uploads/{e["image"]}' if e["image"] else None,
                          "sessoes": [link["product_id"] for link in links if link["essence_id"] == e["id"] and link["product_id"] in session_ids]}
                         for e in essences]
    return Response("window.CARDAPIO = " + json.dumps(data, ensure_ascii=True) + ";", media_type="application/javascript")


@app.get("/health")
def health():
    with database() as db:
        db.execute("SELECT 1").fetchone()
    return {"status": "ok", "app": "TABAGYN"}


@app.get("/login")
def login_page(request: Request):
    return templates.TemplateResponse(request=request, name="manage_login.html", context={"csrf": csrf_token(request)})


attempts = defaultdict(list)
attempt_lock = threading.Lock()
dummy_hash = ph.hash(secrets.token_urlsafe(32))


@app.post("/login")
def login(request: Request, username: str = Form(...), password: str = Form(...), csrf: str = Form(...)):
    verify_csrf(request, csrf)
    address = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with attempt_lock:
        for key in list(attempts):
            attempts[key] = [t for t in attempts[key] if now-t < 300]
            if not attempts[key]:
                del attempts[key]
        if len(attempts[address]) >= 10:
            raise HTTPException(429, "Muitas tentativas. Aguarde cinco minutos.")
        attempts[address].append(now)
    with database() as db:
        row = db.execute("SELECT password_hash FROM admins WHERE username=?", (username.strip(),)).fetchone()
    try:
        valid = ph.verify(row["password_hash"] if row else dummy_hash, password)
    except (VerificationError, InvalidHashError):
        valid = False
    if not row or not valid:
        return templates.TemplateResponse(request=request, name="manage_login.html",
            context={"csrf": csrf_token(request), "error": "Login ou senha inválidos."}, status_code=400)
    with attempt_lock:
        attempts.pop(address, None)
    destination = request.session.get("next", "/admin")
    if destination not in {"/admin", "/admin/cadastros", "/admin/essencias"}:
        destination = "/admin"
    request.session.clear()
    request.session["admin"] = username.strip()
    csrf_token(request)
    return RedirectResponse(destination, 303)


@app.post("/logout")
def logout(request: Request, csrf: str = Form(...), user=Depends(admin)):
    verify_csrf(request, csrf)
    request.session.clear()
    return RedirectResponse("/login", 303)


@app.get("/admin")
def management(request: Request, user=Depends(admin)):
    return page(request, saved=request.query_params.get("saved") == "1")


@app.get("/admin/cadastros")
def registration_hub(request: Request, user=Depends(admin)):
    return templates.TemplateResponse(request=request, name="registrations.html",
                                      context={"csrf": csrf_token(request)})


def valid_product(name, category, description, price):
    name, category, description = name.strip(), category.strip(), description.strip()
    if category not in CATEGORIES:
        raise ValueError("Escolha Sessões, Bebidas, Esquine ou Doces.")
    if not name or len(name) > 140 or not category or len(category) > 80 or len(description) > 1000:
        raise ValueError("Preencha nome e categoria. Use até 140 caracteres no nome, 80 na categoria e 1.000 na descrição.")
    try:
        value = Decimal(price.strip().replace(",", "."))
        if not value.is_finite() or value < 0 or value > 99999 or value != value.quantize(Decimal("0.01")):
            raise ValueError()
    except (InvalidOperation, ValueError):
        raise ValueError("Informe um preço de R$ 0,00 a R$ 99.999,00, com no máximo duas casas decimais.")
    return name, category, description, int(value * 100)


async def store_image(upload):
    if not upload or not upload.filename:
        return None
    content = await upload.read(5 * 1024 * 1024 + 1)
    if len(content) > 5 * 1024 * 1024:
        raise ValueError("A foto deve ter até 5 MB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as original:
                if original.format not in {"JPEG", "PNG", "WEBP"}:
                    raise ValueError("Envie uma imagem JPG, PNG ou WebP.")
                original.load()
                from PIL import ImageOps
                image = ImageOps.exif_transpose(original).convert("RGB")
                image.thumbnail((1600, 1600))
                filename = uuid.uuid4().hex + ".jpg"
                image.save(UPLOADS / filename, "JPEG", quality=88)
                return filename
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ValueError("Não foi possível abrir a foto. Envie JPG, PNG ou WebP de até 20 megapixels.")


@app.post("/admin/products")
async def save_product(request: Request, csrf: str = Form(...), product_id: str = Form(""),
                       name: str = Form(""), category: str = Form(""), description: str = Form(""),
                       price: str = Form(""), available: bool = Form(False), remove_image: bool = Form(False),
                       image: UploadFile | None = File(None), user=Depends(admin)):
    verify_csrf(request, csrf)
    uploaded = None
    try:
        name, category, description, cents = valid_product(name, category, description, price)
        with database() as db:
            existing = db.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone() if product_id else None
            if product_id and not existing:
                raise HTTPException(404, "Produto não encontrado.")
            uploaded = await store_image(image)
            photo = uploaded or (existing["image"] if existing and not remove_image else None)
            if existing:
                db.execute("UPDATE products SET name=?,category=?,description=?,price=?,available=?,image=? WHERE id=?",
                           (name, category, description, cents, int(available), photo, product_id))
            else:
                db.execute("INSERT INTO products VALUES(?,?,?,?,?,?,?)",
                           (uuid.uuid4().hex, category, name, description, cents, int(available), photo))
        if existing and existing["image"] and existing["image"] != photo:
            try:
                (UPLOADS / existing["image"]).unlink(missing_ok=True)
            except OSError:
                # The update is committed; a locked old file must not undo the new photo.
                pass
    except ValueError as error:
        response = page(request, error=str(error))
        response.status_code = 400
        return response
    except Exception:
        if uploaded:
            (UPLOADS / uploaded).unlink(missing_ok=True)
        raise
    return RedirectResponse("/admin?saved=1", 303)


def essence_page(request, **context):
    with database() as db:
        essences = [dict(e) for e in db.execute("SELECT * FROM essences ORDER BY brand,flavor")]
        sessions = db.execute("SELECT * FROM products WHERE category=? ORDER BY name", ("Sessões",)).fetchall()
        links = db.execute("SELECT * FROM essence_sessions").fetchall()
    for e in essences:
        e["sessions"] = [row["product_id"] for row in links if row["essence_id"] == e["id"]]
    return templates.TemplateResponse(request=request, name="essences.html", context={
        "essences": essences, "sessions": sessions, "csrf": csrf_token(request), **context})


@app.get("/admin/essencias")
def manage_essences(request: Request, user=Depends(admin)):
    return essence_page(request, saved=request.query_params.get("saved") == "1")


@app.post("/admin/essencias")
async def save_essence(request: Request, csrf: str = Form(...), essence_id: str = Form(""),
                       brand: str = Form(""), flavor: str = Form(""), available: bool = Form(False),
                       sessions: list[str] = Form(default=[]), remove_image: bool = Form(False),
                       image: UploadFile | None = File(None), user=Depends(admin)):
    verify_csrf(request, csrf)
    uploaded = None
    try:
        brand, flavor = brand.strip(), flavor.strip()
        if not brand or not flavor or len(brand) > 100 or len(flavor) > 140:
            raise ValueError("Preencha a marca (até 100 caracteres) e o sabor (até 140 caracteres).")
        with database() as db:
            allowed = {p["id"] for p in db.execute("SELECT id FROM products WHERE category=?", ("Sessões",))}
            if not set(sessions).issubset(allowed):
                raise ValueError("Selecione apenas sessões cadastradas.")
            existing = db.execute("SELECT * FROM essences WHERE id=?", (essence_id,)).fetchone() if essence_id else None
            if essence_id and not existing:
                raise HTTPException(404, "Essência não encontrada.")
            uploaded = await store_image(image)
            photo = uploaded or (existing["image"] if existing and not remove_image else None)
            key = essence_id or uuid.uuid4().hex
            db.execute("INSERT INTO essences VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET brand=excluded.brand,flavor=excluded.flavor,available=excluded.available,image=excluded.image",
                       (key, brand, flavor, int(available), photo))
            db.execute("DELETE FROM essence_sessions WHERE essence_id=?", (key,))
            db.executemany("INSERT INTO essence_sessions VALUES(?,?)", [(key, session) for session in set(sessions)])
        if existing and existing["image"] and existing["image"] != photo:
            try:
                (UPLOADS / existing["image"]).unlink(missing_ok=True)
            except OSError:
                pass
    except ValueError as error:
        response = essence_page(request, error=str(error))
        response.status_code = 400
        return response
    except Exception:
        if uploaded:
            (UPLOADS / uploaded).unlink(missing_ok=True)
        raise
    return RedirectResponse("/admin/essencias?saved=1", 303)


@app.post("/admin/settings")
def save_settings(request: Request, csrf: str = Form(...), whatsapp: str = Form(""), demonstration: bool = Form(False), user=Depends(admin)):
    verify_csrf(request, csrf)
    phone = "".join(c for c in whatsapp if c.isascii() and c.isdigit())
    if not 10 <= len(phone) <= 15 or phone.startswith("0"):
        response = page(request, error="Informe o WhatsApp com país e DDD, por exemplo: 55 62 99315-4345.")
        response.status_code = 400
        return response
    with database() as db:
        db.execute("UPDATE settings SET whatsapp=?, demonstration=? WHERE id=1", (phone, int(demonstration)))
    return RedirectResponse("/admin?saved=1", 303)
