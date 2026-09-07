from fastapi import APIRouter, Request, Depends, Form, UploadFile, File
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from pathlib import Path
from decimal import Decimal
import shutil, uuid
from ..database import get_db
from ..models import Category, Product, Flavor, HappyHour, HappyHourItem, User
from ..security import require_admin, hash_password

router = APIRouter(prefix="/admin")
templates = Jinja2Templates(directory=Path(__file__).resolve().parents[1] / "templates")
UPLOAD = Path(__file__).resolve().parents[1] / "static/uploads/products"

def ctx(request, **kw):
    require_admin(request)
    return {"request": request, **kw}

@router.get("")
def dashboard(request: Request, db: Session = Depends(get_db)):
    return templates.TemplateResponse("admin/dashboard.html", ctx(request,
        products=db.query(Product).count(), categories=db.query(Category).count(), flavors=db.query(Flavor).count()))

@router.get("/categorias")
def categories(request: Request, db: Session = Depends(get_db)):
    return templates.TemplateResponse("admin/categories.html", ctx(request, items=db.query(Category).order_by(Category.sort_order).all()))

@router.post("/categorias")
def add_category(request: Request, name: str = Form(...), description: str = Form(""), db: Session = Depends(get_db)):
    require_admin(request); db.add(Category(name=name, description=description)); db.commit()
    return RedirectResponse("/admin/categorias", 303)

@router.post("/categorias/{id}/excluir")
def del_category(id:int, request:Request, db:Session=Depends(get_db)):
    require_admin(request); x=db.get(Category,id)
    if x: x.active=False; db.commit()
    return RedirectResponse("/admin/categorias",303)

@router.get("/produtos")
def products(request: Request, db: Session = Depends(get_db)):
    return templates.TemplateResponse("admin/products.html", ctx(request, items=db.query(Product).order_by(Product.name).all(), categories=db.query(Category).filter(Category.active==True).all()))

@router.post("/produtos")
def add_product(request: Request, name:str=Form(...), category_id:int=Form(...), price:Decimal=Form(...), description:str=Form(""), is_session:bool=Form(False), image:UploadFile|None=File(None), db:Session=Depends(get_db)):
    require_admin(request); filename=None
    if image and image.filename:
        ext=Path(image.filename).suffix.lower()
        if ext in {".jpg",".jpeg",".png",".webp"}:
            filename=f"{uuid.uuid4().hex}{ext}"
            with open(UPLOAD/filename,"wb") as f: shutil.copyfileobj(image.file,f)
    db.add(Product(name=name, category_id=category_id, price=price, description=description, is_session=is_session, image=filename))
    db.commit(); return RedirectResponse("/admin/produtos",303)

@router.post("/produtos/{id}/disponibilidade")
def toggle_product(id:int, request:Request, db:Session=Depends(get_db)):
    require_admin(request); p=db.get(Product,id)
    if p: p.available=not p.available; db.commit()
    return RedirectResponse("/admin/produtos",303)

@router.get("/sabores")
def flavors(request:Request, db:Session=Depends(get_db)):
    return templates.TemplateResponse("admin/flavors.html", ctx(request, items=db.query(Flavor).order_by(Flavor.name).all()))

@router.post("/sabores")
def add_flavor(request:Request, name:str=Form(...), brand:str=Form(""), db:Session=Depends(get_db)):
    require_admin(request); db.add(Flavor(name=name, brand=brand or None)); db.commit()
    return RedirectResponse("/admin/sabores",303)

@router.post("/sabores/{id}/disponibilidade")
def toggle_flavor(id:int, request:Request, db:Session=Depends(get_db)):
    require_admin(request); f=db.get(Flavor,id)
    if f: f.available=not f.available; db.commit()
    return RedirectResponse("/admin/sabores",303)

@router.get("/usuarios")
def users(request:Request, db:Session=Depends(get_db)):
    return templates.TemplateResponse("admin/users.html", ctx(request, items=db.query(User).order_by(User.name).all()))

@router.post("/usuarios")
def add_user(request:Request, name:str=Form(...), username:str=Form(...), password:str=Form(...), role:str=Form(...), db:Session=Depends(get_db)):
    require_admin(request); db.add(User(name=name,username=username,password_hash=hash_password(password),role=role)); db.commit()
    return RedirectResponse("/admin/usuarios",303)

@router.get("/happy-hour")
def happy(request:Request, db:Session=Depends(get_db)):
    return templates.TemplateResponse("admin/happy.html", ctx(request, promos=db.query(HappyHour).all(), products=db.query(Product).filter(Product.active==True).all()))

@router.post("/happy-hour")
def add_happy(request:Request, name:str=Form(...), weekdays:str=Form(...), start_time:str=Form(...), end_time:str=Form(...), product_id:int=Form(...), promotional_price:Decimal=Form(...), db:Session=Depends(get_db)):
    require_admin(request)
    from datetime import time
    def t(v): h,m=map(int,v.split(":")); return time(h,m)
    days=[int(x) for x in weekdays.split(",") if x.strip().isdigit()]
    h=HappyHour(name=name,weekdays=days,start_time=t(start_time),end_time=t(end_time)); db.add(h); db.flush()
    db.add(HappyHourItem(happy_hour_id=h.id,product_id=product_id,promotional_price=promotional_price)); db.commit()
    return RedirectResponse("/admin/happy-hour",303)
