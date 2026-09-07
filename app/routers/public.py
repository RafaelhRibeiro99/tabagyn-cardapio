from decimal import Decimal
from fastapi import APIRouter, Request, Depends, Form, HTTPException
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from pathlib import Path
import json
from ..database import get_db
from ..models import Category, Product, Flavor, SessionFlavor, Order, OrderItem, OrderItemFlavor
from ..pricing import effective_price

router = APIRouter()
templates = Jinja2Templates(directory=Path(__file__).resolve().parents[1] / "templates")

@router.get("/")
def menu(request: Request, db: Session = Depends(get_db)):
    categories = db.query(Category).filter(Category.active == True).order_by(Category.sort_order, Category.name).all()
    data = []
    for cat in categories:
        products = db.query(Product).filter(Product.category_id == cat.id, Product.active == True).order_by(Product.sort_order, Product.name).all()
        plist = []
        for p in products:
            price, promo = effective_price(db, p)
            plist.append({"p": p, "price": price, "promo": promo})
        data.append({"cat": cat, "products": plist})
    flavors = db.query(Flavor).filter(Flavor.active == True, Flavor.available == True).order_by(Flavor.name).all()
    return templates.TemplateResponse("menu.html", {"request": request, "data": data, "flavors": flavors})

@router.post("/pedido")
def create_order(request: Request, table_number: str = Form(...), customer_name: str = Form(""), cart_json: str = Form(...), notes: str = Form(""), db: Session = Depends(get_db)):
    cart = json.loads(cart_json)
    if not cart:
        raise HTTPException(400, "Pedido vazio")
    order = Order(table_number=table_number, customer_name=customer_name or None, notes=notes or None, status="NOVO", total=Decimal("0"))
    db.add(order); db.flush()
    total = Decimal("0")
    for entry in cart:
        product = db.get(Product, int(entry["product_id"]))
        if not product or not product.active or not product.available:
            raise HTTPException(400, "Produto indisponível")
        qty = max(1, int(entry.get("quantity", 1)))
        price, _ = effective_price(db, product)
        subtotal = price * qty
        item = OrderItem(order_id=order.id, product_id=product.id, product_name=product.name, quantity=qty, unit_price=price, subtotal=subtotal)
        db.add(item); db.flush()
        if product.is_session:
            flavors = entry.get("flavors", [])
            if sum(int(x["percentage"]) for x in flavors) != 100:
                raise HTTPException(400, "A mistura da sessão deve totalizar 100%")
            allowed = {x.flavor_id for x in db.query(SessionFlavor).filter(SessionFlavor.product_id == product.id).all()}
            for f in flavors:
                flavor = db.get(Flavor, int(f["flavor_id"]))
                if not flavor or not flavor.available or (allowed and flavor.id not in allowed):
                    raise HTTPException(400, "Sabor inválido ou indisponível")
                db.add(OrderItemFlavor(order_item_id=item.id, flavor_name=flavor.name, percentage=int(f["percentage"])))
        total += subtotal
    order.total = total
    db.commit()
    return RedirectResponse(f"/pedido/{order.id}/sucesso", status_code=303)

@router.get("/pedido/{order_id}/sucesso")
def success(order_id: int, request: Request, db: Session = Depends(get_db)):
    order = db.get(Order, order_id)
    return templates.TemplateResponse("success.html", {"request": request, "order": order})
