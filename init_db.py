from dotenv import load_dotenv
load_dotenv()
from app.database import Base, engine
import app.models
Base.metadata.create_all(engine)
print("Banco TABAGYN inicializado.")
