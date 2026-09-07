from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from pathlib import Path
from ..database import get_db
from ..models import Order
from ..security import require_login

router = APIRouter(prefix="/pedidos")
templates = Jinja2Templates(directory=Path(__file__).resolve().parents[1] / "templates")

@router.get("")
def board(request: Request, db: Session = Depends(get_db)):
    require_login(request)
    orders = db.query(Order).order_by(Order.created_at.desc()).limit(100).all()
    return templates.TemplateResponse("orders/board.html", {"request": request, "orders": orders})

@router.post("/{order_id}/status")
def change_status(order_id: int, request: Request, status: str = Form(...), db: Session = Depends(get_db)):
    require_login(request)
    order = db.get(Order, order_id)
    if order and status in {"NOVO","EM PREPARO","PRONTO","ENTREGUE","CANCELADO"}:
        order.status = status
        db.commit()
    return RedirectResponse("/pedidos", status_code=303)
