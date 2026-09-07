from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session
from .models import HappyHour, HappyHourItem

def effective_price(db: Session, product, timezone="America/Sao_Paulo"):
    now = datetime.now(ZoneInfo(timezone))
    weekday = now.weekday()
    hh = db.query(HappyHour).filter(HappyHour.active == True).all()
    for promo in hh:
        if weekday in (promo.weekdays or []) and promo.start_time <= now.time() <= promo.end_time:
            item = db.query(HappyHourItem).filter(
                HappyHourItem.happy_hour_id == promo.id,
                HappyHourItem.product_id == product.id
            ).first()
            if item:
                return item.promotional_price, promo.name
    return product.price, None
