import getpass
from dotenv import load_dotenv
load_dotenv()
from app.database import SessionLocal
from app.models import User
from app.security import hash_password

db=SessionLocal()
name=input("Nome do administrador: ").strip()
username=input("Login: ").strip()
password=getpass.getpass("Senha: ")
if db.query(User).filter(User.username==username).first():
    print("Esse login já existe.")
else:
    db.add(User(name=name, username=username, password_hash=hash_password(password), role="ADMINISTRADOR", active=True))
    db.commit()
    print("Administrador criado com sucesso.")
db.close()
