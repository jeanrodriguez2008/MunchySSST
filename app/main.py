import sys
import os
import json
import shutil
from pathlib import Path
from datetime import datetime, timedelta
from collections import Counter

sys.path.append(str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, Request, HTTPException, Form, File, UploadFile, Response, status
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import pandas as pd
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import uvicorn
# --- CONFIGURACIÓN DE BASE DE DATOS NEON TECH (SQLAlchemy) ---
from sqlalchemy import create_engine, Column, String, Boolean, Integer, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

# NUEVA URL DE CONEXIÓN A NEON TECH
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://neondb_owner:npg_am8Ejz7hZGSP@ep-young-star-ayzjzes8-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Modelos SQLAlchemy
class UserModel(Base):
    __tablename__ = "users"
    username = Column(String, primary_key=True, index=True)
    password = Column(String, nullable=False)
    role = Column(String, default="Analista")
    security_question = Column(String, nullable=True)
    security_answer = Column(String, nullable=True)

class WorkerModel(Base):
    __tablename__ = "workers"
    cedula = Column(String, primary_key=True, index=True)
    data = Column(Text, nullable=False)  # Almacena el expediente completo en formato JSON

# Crear tablas en Neon Tech si no existen
Base.metadata.create_all(bind=engine)

app = FastAPI(title="MunchySSST Local")

BASE_DIR = Path(__file__).resolve().parent

os.makedirs(BASE_DIR / "static/uploads", exist_ok=True)
os.makedirs(BASE_DIR / "static/img", exist_ok=True)
os.makedirs(BASE_DIR / "static/exports", exist_ok=True)

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# Función de dependencia para obtener la sesión de BD
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Crear usuario Webmaster inicial si la base de datos está vacía
def inicializar_webmaster():
    db = SessionLocal()
    webmaster = db.query(UserModel).filter(UserModel.username == "webmaster").first()
    if not webmaster:
        webmaster = UserModel(
            username="webmaster",
            password="web123456",
            role="Webmaster",
            security_question="¿Nombre de tu primera mascota?",
            security_answer="purro"
        )
        db.add(webmaster)
        db.commit()
    db.close()

inicializar_webmaster()

class EventSchema(BaseModel):
    fecha: Optional[str] = ""
    tipo: Optional[str] = ""
    descripcion: str
    rest_days: Optional[int] = 0
    is_reposo: Optional[bool] = False

class VacationSchema(BaseModel):
    fecha_inicio: str
    fecha_reintegro: str
    dias_vacaciones: Optional[int] = 0
    observacion: Optional[str] = ""

class RiskSchema(BaseModel):
    fecha: str
    puesto: str
    descripcion_riesgo: str

class MedicalExamSchema(BaseModel):
    fecha: str
    tipo_examen: str
    resultado: Optional[str] = "Apto"
    observaciones: Optional[str] = ""

def get_current_user(request: Request, db: Session):
    username = request.cookies.get("session_user")
    if not username:
        return None
    user = db.query(UserModel).filter(UserModel.username == username).first()
    if not user:
        return None
    return {
        "username": user.username,
        "password": user.password,
        "role": user.role,
        "security_question": user.security_question,
        "security_answer": user.security_answer
    }

def calcular_dias_sin_reposo(worker: dict) -> int:
    if worker.get("is_on_leave"):
        return 0
    
    fechas_reposo = []
    for ev in worker.get("medical_events", []):
        if ev.get("tipo") == "Reposo Médico" and ev.get("fecha"):
            try:
                dt = datetime.strptime(ev["fecha"], "%Y-%m-%d")
                fechas_reposo.append(dt)
            except ValueError:
                pass
    
    if fechas_reposo:
        ultima_fecha = max(fechas_reposo)
        dias = (datetime.now() - ultima_fecha).days
        return max(dias, 0)
    
    if worker.get("hire_date"):
        try:
            dt_ingreso = datetime.strptime(worker["hire_date"], "%Y-%m-%d")
            return max((datetime.now() - dt_ingreso).days, 0)
        except ValueError:
            pass
            
    return 0

def evaluar_estatus_trabajador(worker: dict) -> str:
    if worker.get("exit_date"):
        return "INACTIVO"
    if worker.get("is_on_leave"):
        return "EN REPOSO"
    
    hoy = datetime.now().date()
    for vac in worker.get("vacations", []):
        try:
            inicio = datetime.strptime(vac["fecha_inicio"], "%Y-%m-%d").date()
            reintegro = datetime.strptime(vac["fecha_reintegro"], "%Y-%m-%d").date()
            if inicio <= hoy < reintegro:
                return "DE VACACIONES"
        except ValueError:
            pass
            
    return "ACTIVO"

def obtener_workers_db(db: Session) -> Dict[str, dict]:
    records = db.query(WorkerModel).all()
    res = {}
    for r in records:
        try:
            res[r.cedula] = json.loads(r.data)
        except Exception:
            pass
    return res

def obtener_alertas_contrato(db: Session) -> List[str]:
    alertas = []
    hoy = datetime.now().date()
    workers = obtener_workers_db(db)
    for w in workers.values():
        if w.get("employment_type") == "Contratado" and w.get("contract_end_date"):
            try:
                dt_fin = datetime.strptime(w["contract_end_date"], "%Y-%m-%d").date()
                dias_restantes = (dt_fin - hoy).days
                if 0 <= dias_restantes <= 10:
                    nombre_completo = f"{w.get('first_name', '')} {w.get('last_name', '')}".strip()
                    dept = w.get("department", "N/A")
                    if dias_restantes == 0:
                        msg = f"El Trabajador {nombre_completo}, perteneciente al Departamento {dept}, vence su contrato HOY."
                    else:
                        msg = f"El Trabajador {nombre_completo}, perteneciente al Departamento {dept}, le quedan {dias_restantes} días para vencer el contrato."
                    alertas.append(msg)
            except ValueError:
                pass
    return alertas

def evaluar_examenes_pendientes(worker: dict) -> List[Dict[str, str]]:
    alertas_examenes = []
    hoy = datetime.now().date()
    nombre = f"{worker.get('first_name', '')} {worker.get('last_name', '')}".strip()
    dept = worker.get("department", "N/A")
    examenes_realizados = worker.get("medical_exams", [])

    for vac in worker.get("vacations", []):
        try:
            f_inicio = datetime.strptime(vac["fecha_inicio"], "%Y-%m-%d").date()
            f_reintegro = datetime.strptime(vac["fecha_reintegro"], "%Y-%m-%d").date()

            dias_para_vac = (f_inicio - hoy).days
            if 0 <= dias_para_vac <= 15:
                tiene_examen = any(
                    e.get("tipo_examen") == "Prevacacional" and
                    abs((datetime.strptime(e["fecha"], "%Y-%m-%d").date() - f_inicio).days) <= 30
                    for e in examenes_realizados if e.get("fecha")
                )
                if not tiene_examen:
                    alertas_examenes.append({
                        "tipo": "Prevacacional",
                        "mensaje": f"El trabajador {nombre} ({dept}) inicia vacaciones el {f_inicio}. Requiere Examen Prevacacional urgente."
                    })

            dias_post_vac = (hoy - f_reintegro).days
            if -2 <= dias_post_vac <= 10:
                tiene_examen_post = any(
                    e.get("tipo_examen") == "Postvacacional" and
                    abs((datetime.strptime(e["fecha"], "%Y-%m-%d").date() - f_reintegro).days) <= 15
                    for e in examenes_realizados if e.get("fecha")
                )
                if not tiene_examen_post:
                    alertas_examenes.append({
                        "tipo": "Postvacacional",
                        "mensaje": f"El trabajador {nombre} ({dept}) reingresó de vacaciones el {f_reintegro}. Pendiente Examen Postvacacional."
                    })
        except ValueError:
            pass

    fechas_rutinarios = []
    for e in examenes_realizados:
        if e.get("tipo_examen") == "Rutinario Anual" and e.get("fecha"):
            try:
                fechas_rutinarios.append(datetime.strptime(e["fecha"], "%Y-%m-%d").date())
            except ValueError:
                pass
    
    fecha_referencia = max(fechas_rutinarios) if fechas_rutinarios else (
        datetime.strptime(worker["hire_date"], "%Y-%m-%d").date() if worker.get("hire_date") else None
    )

    if fecha_referencia:
        proximo_rutinario = fecha_referencia + timedelta(days=365)
        dias_para_rutinario = (proximo_rutinario - hoy).days
        if dias_para_rutinario <= 30:
            alertas_examenes.append({
                "tipo": "Rutinario Anual",
                "mensaje": f"El trabajador {nombre} ({dept}) tiene vencido o próximo a vencer su Examen Rutinario Anual (Fecha límite: {proximo_rutinario})."
            })

    return alertas_examenes

def obtener_alertas_examenes(db: Session) -> List[str]:
    todas_alertas = []
    workers = obtener_workers_db(db)
    for w in workers.values():
        res = evaluar_examenes_pendientes(w)
        for item in res:
            todas_alertas.append(item["mensaje"])
    return todas_alertas

@app.get("/login")
def login_view(request: Request):
    return templates.TemplateResponse(request=request, name="login.html")

@app.post("/api/auth/login")
def login_api(username: str = Form(...), password: str = Form(...), response: Response = None):
    db = SessionLocal()
    user = db.query(UserModel).filter(UserModel.username == username.lower().strip()).first()
    if not user or user.password != password:
        db.close()
        raise HTTPException(status_code=400, detail="Nombre de usuario o contraseña incorrectos.")
    
    res = RedirectResponse(url="/", status_code=303)
    res.set_cookie(key="session_user", value=user.username, httponly=True)
    db.close()
    return res

@app.get("/logout")
def logout():
    res = RedirectResponse(url="/login", status_code=303)
    res.delete_cookie("session_user")
    return res

@app.post("/api/auth/register")
def register_user(
    username: str = Form(...),
    password: str = Form(...),
    security_question: str = Form(...),
    security_answer: str = Form(...)
):
    db = SessionLocal()
    uname = username.lower().strip()
    existente = db.query(UserModel).filter(UserModel.username == uname).first()
    if existente:
        db.close()
        raise HTTPException(status_code=400, detail="El nombre de usuario ya se encuentra registrado.")
    
    nuevo_usuario = UserModel(
        username=uname,
        password=password,
        role="Analista",
        security_question=security_question,
        security_answer=security_answer.lower().strip()
    )
    db.add(nuevo_usuario)
    db.commit()
    db.close()
    return {"message": "Usuario registrado exitosamente."}

@app.get("/api/auth/get-security-question/{username}")
def get_security_question(username: str):
    db = SessionLocal()
    uname = username.lower().strip()
    user = db.query(UserModel).filter(UserModel.username == uname).first()
    if not user:
        db.close()
        raise HTTPException(status_code=404, detail="El usuario no se encuentra registrado.")
    pregunta = user.security_question or "Pregunta no configurada."
    db.close()
    return {"security_question": pregunta}

@app.post("/api/auth/recover")
def recover_password(
    username: str = Form(...),
    security_answer: str = Form(...),
    new_password: str = Form(...)
):
    db = SessionLocal()
    uname = username.lower().strip()
    user = db.query(UserModel).filter(UserModel.username == uname).first()
    if not user:
        db.close()
        raise HTTPException(status_code=404, detail="El usuario especificado no existe.")
    
    if user.security_answer != security_answer.lower().strip():
        db.close()
        raise HTTPException(status_code=400, detail="La respuesta a la pregunta de seguridad es incorrecta.")
    
    user.password = new_password
    db.commit()
    db.close()
    return {"message": "Contraseña actualizada exitosamente."}

@app.get("/")
def home(request: Request):
    db = SessionLocal()
    user = get_current_user(request, db)
    if not user:
        db.close()
        return RedirectResponse(url="/login")
    alertas_contratos = obtener_alertas_contrato(db)
    alertas_examenes = obtener_alertas_examenes(db)
    db.close()
    return templates.TemplateResponse(
        request=request, 
        name="worker_profile.html", 
        context={
            "current_user": user, 
            "contract_alerts": alertas_contratos,
            "exam_alerts": alertas_examenes
        }
    )

@app.get("/register")
def register_page(request: Request):
    db = SessionLocal()
    user = get_current_user(request, db)
    db.close()
    if not user:
        return RedirectResponse(url="/login")
    
    if user.get("role") not in ["Webmaster", "Coordinador"]:
        return RedirectResponse(url="/")
        
    return templates.TemplateResponse(request=request, name="register_worker.html", context={"current_user": user})

@app.get("/users")
def users_management_page(request: Request):
    db = SessionLocal()
    user = get_current_user(request, db)
    db.close()
    if not user or user["role"] not in ["Webmaster", "Coordinador"]:
        return RedirectResponse(url="/")
    return templates.TemplateResponse(request=request, name="user_management.html", context={"current_user": user})

@app.get("/api/users/list")
def list_users(request: Request):
    db = SessionLocal()
    user = get_current_user(request, db)
    if not user or user["role"] not in ["Webmaster", "Coordinador"]:
        db.close()
        raise HTTPException(status_code=403, detail="Acceso denegado a la gestión de usuarios.")
    
    users = db.query(UserModel).all()
    users_list = []
    for u in users:
        if user["role"] == "Coordinador" and u.role == "Webmaster":
            continue
        users_list.append({
            "username": u.username,
            "role": u.role,
            "security_question": u.security_question
        })
    db.close()
    return users_list

@app.put("/api/users/update-role")
def update_user_role(username: str = Form(...), new_role: str = Form(...), request: Request = None):
    db = SessionLocal()
    current = get_current_user(request, db)
    if not current or current["role"] not in ["Webmaster", "Coordinador"]:
        db.close()
        raise HTTPException(status_code=403, detail="Acceso denegado.")
    
    target_user = db.query(UserModel).filter(UserModel.username == username.lower().strip()).first()
    if not target_user:
        db.close()
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    
    target_user.role = new_role
    db.commit()
    db.close()
    return {"message": f"El rol de {username} ha sido actualizado a {new_role}."}

@app.delete("/api/users/delete/{username}")
def delete_user(username: str, request: Request):
    db = SessionLocal()
    current = get_current_user(request, db)
    if not current or current["role"] not in ["Webmaster", "Coordinador"]:
        db.close()
        raise HTTPException(status_code=403, detail="Acceso denegado.")
    
    uname = username.lower().strip()
    target_user = db.query(UserModel).filter(UserModel.username == uname).first()
    
    if not target_user:
        db.close()
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    
    if target_user.role == "Webmaster":
        db.close()
        raise HTTPException(status_code=400, detail="La cuenta principal de Webmaster no puede ser eliminada.")
    
    db.delete(target_user)
    db.commit()
    db.close()
    return {"message": f"El usuario '{username}' ha sido eliminado exitosamente."}

@app.get("/api/dashboard/stats")
def get_dashboard_stats():
    db = SessionLocal()
    workers_dict = obtener_workers_db(db)
    db.close()

    if not workers_dict:
        return {
            "total_trabajadores": 0,
            "total_activos": 0,
            "total_reposo": 0,
            "total_masculino": 0,
            "total_femenino": 0,
            "area_administrativos": 0,
            "area_operativos": 0,
            "area_ventas": 0,
            "total_lentes": 0,
            "total_discapacidad": 0,
            "total_cronicas": 0,
            "dias_sin_accidentes_empresa": 0,
            "gerencias_stats": [],
            "top_cronicas": []
        }

    total_trabajadores = len(workers_dict)
    total_reposo = sum(1 for w in workers_dict.values() if evaluar_estatus_trabajador(w) == "EN REPOSO")
    total_activos = sum(1 for w in workers_dict.values() if evaluar_estatus_trabajador(w) == "ACTIVO")

    total_masculino = sum(1 for w in workers_dict.values() if w.get("gender") == "Masculino")
    total_femenino = sum(1 for w in workers_dict.values() if w.get("gender") == "Femenino")

    area_administrativos = sum(1 for w in workers_dict.values() if w.get("area") == "Administrativo")
    area_operativos = sum(1 for w in workers_dict.values() if w.get("area") == "Operativo")
    area_ventas = sum(1 for w in workers_dict.values() if w.get("area") == "Ventas")

    total_lentes = sum(1 for w in workers_dict.values() if w.get("uses_glasses") == "Sí")
    total_discapacidad = sum(1 for w in workers_dict.values() if w.get("disability_condition") and w.get("disability_condition").strip().lower() != "ninguna")
    total_cronicas = sum(1 for w in workers_dict.values() if len(w.get("pathologies", [])) > 0 or (w.get("chronic_treatment") and w.get("chronic_treatment").strip().lower() != "ninguno"))

    fechas_accidentes_empresa = []
    accidentes_por_gerencia: Dict[str, List[datetime]] = {}
    departamentos_existentes = set()

    for w in workers_dict.values():
        dept = w.get("department", "Sin Especificar").strip().title()
        if dept:
            departamentos_existentes.add(dept)
            if dept not in accidentes_por_gerencia:
                accidentes_por_gerencia[dept] = []

        for ev in w.get("medical_events", []):
            if ev.get("tipo") == "Accidente Laboral" and ev.get("fecha"):
                try:
                    dt = datetime.strptime(ev["fecha"], "%Y-%m-%d")
                    fechas_accidentes_empresa.append(dt)
                    if dept:
                        accidentes_por_gerencia[dept].append(dt)
                except ValueError:
                    pass

    hoy = datetime.now()
    dias_sin_accidentes_empresa = (hoy - max(fechas_accidentes_empresa)).days if fechas_accidentes_empresa else 0

    stats_gerencias = []
    for dept in sorted(departamentos_existentes):
        fechas_dept = accidentes_por_gerencia.get(dept, [])
        dias_dept = (hoy - max(fechas_dept)).days if fechas_dept else 0
        stats_gerencias.append({
            "gerencia": dept,
            "dias_sin_accidentes": max(dias_dept, 0)
        })

    patologias_lista = []
    for w in workers_dict.values():
        for p in w.get("pathologies", []):
            if p.get("nombre"):
                patologias_lista.append(p["nombre"].strip().title())
    
    conteo = Counter(patologias_lista)
    top_3 = [{"nombre": k, "cantidad": v} for k, v in conteo.most_common(3)]

    return {
        "total_trabajadores": total_trabajadores,
        "total_activos": total_activos,
        "total_reposo": total_reposo,
        "total_masculino": total_masculino,
        "total_femenino": total_femenino,
        "area_administrativos": area_administrativos,
        "area_operativos": area_operativos,
        "area_ventas": area_ventas,
        "total_lentes": total_lentes,
        "total_discapacidad": total_discapacidad,
        "total_cronicas": total_cronicas,
        "dias_sin_accidentes_empresa": max(dias_sin_accidentes_empresa, 0),
        "gerencias_stats": stats_gerencias,
        "top_cronicas": top_3
    }

@app.get("/api/workers/search/{cedula}")
def search_worker(cedula: str):
    db = SessionLocal()
    cedula_limpia = cedula.upper().strip()
    record = db.query(WorkerModel).filter(WorkerModel.cedula == cedula_limpia).first()
    db.close()
    if not record:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado")
    
    worker = json.loads(record.data)
    worker["days_without_rest"] = calcular_dias_sin_reposo(worker)
    worker["calculated_status"] = evaluar_estatus_trabajador(worker)
    worker["pending_exams"] = evaluar_examenes_pendientes(worker)
    return worker

@app.post("/api/workers/create")
async def create_worker(
    cedula: str = Form(...),
    first_name: str = Form(...),
    last_name: str = Form(...),
    gender: str = Form("Masculino"),
    birthdate: str = Form(...),
    phone: str = Form(""),
    email: str = Form(...),
    address: str = Form(...),
    address_reference: str = Form(...),
    shirt_size: str = Form(""),
    pants_size: str = Form(""),
    shoe_size: str = Form(""),
    overall_size: str = Form(""),
    emergency_name: str = Form(...),
    emergency_kinship: str = Form(...),
    emergency_phone: str = Form(...),
    worker_code: str = Form(...),
    position: str = Form(...),
    department: str = Form(...),
    area: str = Form("Operativo"),
    supervisor: str = Form(""),
    employment_type: str = Form(...),
    hire_date: str = Form(...),
    contract_end_date: str = Form(""),
    exit_date: str = Form(""),
    service_time: str = Form(""),
    last_dotation_date: str = Form(""),
    dotation_status: str = Form("Completa"),
    dotation_comments: str = Form(""),
    education_level: str = Form(...),
    profession: str = Form(""),
    additional_degrees_json: str = Form("[]"),
    courses_json: str = Form("[]"),
    certifications_json: str = Form("[]"),
    awards_json: str = Form("[]"),
    blood_type: str = Form(...),
    uses_glasses: str = Form("No"),
    allergies_meds: str = Form("Ninguna"),
    allergies_food: str = Form("Ninguna"),
    chronic_treatment: str = Form("Ninguno"),
    disability_condition: str = Form("Ninguna"),
    pathologies_json: str = Form("[]"),
    medical_events_json: str = Form("[]"),
    vacations_json: str = Form("[]"),
    risk_notifications_json: str = Form("[]"),
    medical_exams_json: str = Form("[]"),
    photo_file: Optional[UploadFile] = File(None)
):
    db = SessionLocal()
    cedula_limpia = cedula.upper().strip()
    existente = db.query(WorkerModel).filter(WorkerModel.cedula == cedula_limpia).first()
    if existente:
        db.close()
        raise HTTPException(status_code=400, detail="La cédula ya se encuentra registrada.")

    photo_url = "/static/uploads/default_avatar.png"
    if photo_file and photo_file.filename:
        file_ext = Path(photo_file.filename).suffix
        filename = f"photo_{cedula_limpia}{file_ext}"
        filepath = BASE_DIR / "static/uploads" / filename
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(photo_file.file, buffer)
        photo_url = f"/static/uploads/{filename}"

    new_worker_dict = {
        "cedula": cedula_limpia,
        "first_name": first_name,
        "last_name": last_name,
        "gender": gender,
        "birthdate": birthdate,
        "phone": phone,
        "email": email,
        "address": address,
        "address_reference": address_reference,
        "shirt_size": shirt_size,
        "pants_size": pants_size,
        "shoe_size": shoe_size,
        "overall_size": overall_size,
        "emergency_contact": {
            "name": emergency_name,
            "kinship": emergency_kinship,
            "phone": emergency_phone
        },
        "worker_code": worker_code,
        "position": position,
        "department": department,
        "area": area,
        "supervisor": supervisor,
        "employment_type": employment_type,
        "hire_date": hire_date,
        "contract_end_date": contract_end_date if employment_type == "Contratado" else "",
        "exit_date": exit_date,
        "service_time": service_time,
        "last_dotation_date": last_dotation_date,
        "dotation_status": dotation_status,
        "dotation_comments": dotation_comments,
        "education_level": education_level,
        "profession": profession,
        "additional_degrees": json.loads(additional_degrees_json),
        "courses": json.loads(courses_json),
        "certifications": json.loads(certifications_json),
        "awards": json.loads(awards_json),
        "blood_type": blood_type,
        "uses_glasses": uses_glasses,
        "allergies_meds": allergies_meds,
        "allergies_food": allergies_food,
        "chronic_treatment": chronic_treatment,
        "disability_condition": disability_condition,
        "pathologies": json.loads(pathologies_json),
        "medical_events": json.loads(medical_events_json),
        "vacations": json.loads(vacations_json),
        "risk_notifications": json.loads(risk_notifications_json),
        "medical_exams": json.loads(medical_exams_json),
        "photo_url": photo_url,
        "is_on_leave": False,
        "leave_days": 0,
        "leave_reason": ""
    }

    record = WorkerModel(cedula=cedula_limpia, data=json.dumps(new_worker_dict, ensure_ascii=False))
    db.add(record)
    db.commit()
    db.close()
    return {"message": "Trabajador registrado exitosamente", "cedula": cedula_limpia}

@app.put("/api/workers/update/{cedula}")
async def update_worker(
    cedula: str,
    first_name: str = Form(...),
    last_name: str = Form(...),
    gender: str = Form("Masculino"),
    birthdate: str = Form(...),
    phone: str = Form(""),
    email: str = Form(...),
    address: str = Form(...),
    address_reference: str = Form(...),
    shirt_size: str = Form(""),
    pants_size: str = Form(""),
    shoe_size: str = Form(""),
    overall_size: str = Form(""),
    emergency_name: str = Form(...),
    emergency_kinship: str = Form(...),
    emergency_phone: str = Form(...),
    worker_code: str = Form(...),
    position: str = Form(...),
    department: str = Form(...),
    area: str = Form("Operativo"),
    supervisor: str = Form(""),
    employment_type: str = Form(...),
    hire_date: str = Form(...),
    contract_end_date: str = Form(""),
    exit_date: str = Form(""),
    service_time: str = Form(""),
    last_dotation_date: str = Form(""),
    dotation_status: str = Form("Completa"),
    dotation_comments: str = Form(""),
    education_level: str = Form(...),
    profession: str = Form(""),
    additional_degrees_json: str = Form("[]"),
    courses_json: str = Form("[]"),
    certifications_json: str = Form("[]"),
    awards_json: str = Form("[]"),
    blood_type: str = Form(...),
    uses_glasses: str = Form("No"),
    allergies_meds: str = Form(""),
    allergies_food: str = Form(""),
    chronic_treatment: str = Form(""),
    disability_condition: str = Form(""),
    pathologies_json: str = Form("[]"),
    risk_notifications_json: str = Form("[]"),
    photo_file: Optional[UploadFile] = File(None)
):
    db = SessionLocal()
    cedula_limpia = cedula.upper().strip()
    record = db.query(WorkerModel).filter(WorkerModel.cedula == cedula_limpia).first()
    if not record:
        db.close()
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")

    worker = json.loads(record.data)
    worker["first_name"] = first_name
    worker["last_name"] = last_name
    worker["gender"] = gender
    worker["birthdate"] = birthdate
    worker["phone"] = phone
    worker["email"] = email
    worker["address"] = address
    worker["address_reference"] = address_reference
    
    worker["shirt_size"] = shirt_size
    worker["pants_size"] = pants_size
    worker["shoe_size"] = shoe_size
    worker["overall_size"] = overall_size

    worker["emergency_contact"] = {
        "name": emergency_name,
        "kinship": emergency_kinship,
        "phone": emergency_phone
    }

    worker["worker_code"] = worker_code
    worker["position"] = position
    worker["department"] = department
    worker["area"] = area
    worker["supervisor"] = supervisor
    worker["employment_type"] = employment_type
    worker["hire_date"] = hire_date
    worker["contract_end_date"] = contract_end_date if employment_type == "Contratado" else ""
    worker["exit_date"] = exit_date
    worker["service_time"] = service_time

    worker["last_dotation_date"] = last_dotation_date
    worker["dotation_status"] = dotation_status
    worker["dotation_comments"] = dotation_comments

    worker["education_level"] = education_level
    worker["profession"] = profession
    worker["additional_degrees"] = json.loads(additional_degrees_json)
    worker["courses"] = json.loads(courses_json)
    worker["certifications"] = json.loads(certifications_json)
    worker["awards"] = json.loads(awards_json)

    worker["blood_type"] = blood_type
    worker["uses_glasses"] = uses_glasses
    worker["allergies_meds"] = allergies_meds
    worker["allergies_food"] = allergies_food
    worker["chronic_treatment"] = chronic_treatment
    worker["disability_condition"] = disability_condition
    worker["pathologies"] = json.loads(pathologies_json)
    
    nuevos_riesgos = json.loads(risk_notifications_json)
    if nuevos_riesgos:
        worker["risk_notifications"] = nuevos_riesgos

    if photo_file and photo_file.filename:
        file_ext = Path(photo_file.filename).suffix
        filename = f"photo_{cedula_limpia}{file_ext}"
        filepath = BASE_DIR / "static/uploads" / filename
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(photo_file.file, buffer)
        worker["photo_url"] = f"/static/uploads/{filename}"

    record.data = json.dumps(worker, ensure_ascii=False)
    db.commit()
    db.close()
    return {"message": "Expediente actualizado exitosamente"}

@app.post("/api/workers/add-medical-exam/{cedula}")
def add_medical_exam(cedula: str, exam: MedicalExamSchema):
    db = SessionLocal()
    cedula_limpia = cedula.upper().strip()
    record = db.query(WorkerModel).filter(WorkerModel.cedula == cedula_limpia).first()
    if not record:
        db.close()
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")
    
    worker = json.loads(record.data)
    if "medical_exams" not in worker:
        worker["medical_exams"] = []
    
    worker["medical_exams"].append(exam.dict())
    record.data = json.dumps(worker, ensure_ascii=False)
    db.commit()
    db.close()
    return {"message": f"Examen preventivo '{exam.tipo_examen}' registrado exitosamente."}

@app.post("/api/workers/add-vacation/{cedula}")
def add_vacation(cedula: str, vacation: VacationSchema):
    db = SessionLocal()
    cedula_limpia = cedula.upper().strip()
    record = db.query(WorkerModel).filter(WorkerModel.cedula == cedula_limpia).first()
    if not record:
        db.close()
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")
    
    worker = json.loads(record.data)
    if "vacations" not in worker:
        worker["vacations"] = []
    
    worker["vacations"].append(vacation.dict())
    record.data = json.dumps(worker, ensure_ascii=False)
    db.commit()
    db.close()
    return {"message": "Período vacacional registrado exitosamente"}

@app.post("/api/workers/add-risk/{cedula}")
def add_risk_notification(cedula: str, risk: RiskSchema):
    db = SessionLocal()
    cedula_limpia = cedula.upper().strip()
    record = db.query(WorkerModel).filter(WorkerModel.cedula == cedula_limpia).first()
    if not record:
        db.close()
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")
    
    worker = json.loads(record.data)
    if "risk_notifications" not in worker:
        worker["risk_notifications"] = []
    
    worker["risk_notifications"].append(risk.dict())
    record.data = json.dumps(worker, ensure_ascii=False)
    db.commit()
    db.close()
    return {"message": "Notificación de riesgo registrada exitosamente"}

@app.post("/api/workers/discharge/{cedula}")
def discharge_worker(cedula: str):
    db = SessionLocal()
    cedula_limpia = cedula.upper().strip()
    record = db.query(WorkerModel).filter(WorkerModel.cedula == cedula_limpia).first()
    if not record:
        db.close()
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")
    
    worker = json.loads(record.data)
    worker["is_on_leave"] = False
    worker["leave_days"] = 0
    worker["leave_reason"] = ""
    record.data = json.dumps(worker, ensure_ascii=False)
    db.commit()
    db.close()
    return {"message": "Trabajador dado de alta exitosamente"}

@app.post("/api/workers/add-event/{cedula}")
def add_event(cedula: str, event: EventSchema):
    db = SessionLocal()
    cedula_limpia = cedula.upper().strip()
    record = db.query(WorkerModel).filter(WorkerModel.cedula == cedula_limpia).first()
    if not record:
        db.close()
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")
    
    worker = json.loads(record.data)
    if "medical_events" not in worker:
        worker["medical_events"] = []

    worker["medical_events"].append(event.dict())

    if event.is_reposo and event.tipo == "Reposo Médico":
        worker["is_on_leave"] = True
        worker["leave_days"] = event.rest_days
        worker["leave_reason"] = event.descripcion
    
    record.data = json.dumps(worker, ensure_ascii=False)
    db.commit()
    db.close()
    return {"message": "Evento registrado exitosamente"}

@app.delete("/api/workers/delete/{cedula}")
def delete_worker(cedula: str):
    db = SessionLocal()
    cedula_limpia = cedula.upper().strip()
    record = db.query(WorkerModel).filter(WorkerModel.cedula == cedula_limpia).first()
    if not record:
        db.close()
        raise HTTPException(status_code=404, detail="Trabajador no encontrado para eliminar")
    
    db.delete(record)
    db.commit()
    db.close()
    return {"message": f"Trabajador C.I. {cedula_limpia} eliminado correctamente."}

@app.get("/api/workers/export/excel")
def export_excel():
    db = SessionLocal()
    workers_dict = obtener_workers_db(db)
    db.close()

    if not workers_dict:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="No se encontraron registros de trabajadores en la base de datos para exportar."
        )

    records = []
    for w in workers_dict.values():
        records.append({
            "Código Trabajador": w.get("worker_code", ""),
            "Cédula": w.get("cedula", ""),
            "Estatus Generado": evaluar_estatus_trabajador(w),
            "Nombres": w.get("first_name", ""),
            "Apellidos": w.get("last_name", ""),
            "Género": w.get("gender", "Masculino"),
            "Cargo": w.get("position", ""),
            "Departamento": w.get("department", ""),
            "Área": w.get("area", "Operativo"),
            "Condición Laboral": w.get("employment_type", "Fijo"),
            "Vencimiento Contrato": w.get("contract_end_date", "N/A"),
            "Talla Camisa": w.get("shirt_size", ""),
            "Talla Pantalón": w.get("pants_size", ""),
            "Talla Calzado": w.get("shoe_size", ""),
            "Talla Braga/Bata": w.get("overall_size", ""),
            "Usa Lentes": w.get("uses_glasses", "No"),
            "Fecha Ingreso": w.get("hire_date", ""),
            "Fecha Egreso": w.get("exit_date", ""),
            "Tiempo Servicio": w.get("service_time", ""),
            "Última Dotación": w.get("last_dotation_date", ""),
            "Estatus Dotación": w.get("dotation_status", ""),
            "Pendientes Dotación": w.get("dotation_comments", "")
        })

    df = pd.DataFrame(records)
    export_path = str(BASE_DIR / "static/exports/Listado_Trabajadores_MunchySSST.xlsx")
    df.to_excel(export_path, index=False)

    return FileResponse(
        path=export_path, 
        filename="Listado_Trabajadores_MunchySSST.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

@app.get("/api/workers/export/pdf/{cedula}")
def export_pdf(cedula: str):
    db = SessionLocal()
    cedula_limpia = cedula.upper().strip()
    record = db.query(WorkerModel).filter(WorkerModel.cedula == cedula_limpia).first()
    db.close()
    if not record:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")

    worker = json.loads(record.data)
    pdf_filename = f"Ficha_Trabajador_{worker['cedula']}.pdf"
    pdf_path = str(BASE_DIR / f"static/exports/{pdf_filename}")
    
    c = canvas.Canvas(pdf_path, pagesize=letter)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, 750, "ALIMENTOS MUNCHY, C.A. - FICHA DE SALUD Y SEGURIDAD")
    
    c.setFont("Helvetica", 10)
    c.drawString(50, 730, f"Cédula: {worker['cedula']} | Código: {worker['worker_code']}")
    c.drawString(50, 715, f"Nombre Completo: {worker['first_name']} {worker['last_name']} | Género: {worker.get('gender', 'N/A')}")
    c.drawString(50, 700, f"Cargo: {worker['position']} | Dept: {worker['department']} | Área: {worker.get('area', 'N/A')}")
    c.drawString(50, 685, f"Condición: {worker.get('employment_type','Fijo')} | Fin Contrato: {worker.get('contract_end_date','N/A')}")
    c.drawString(50, 670, f"Tallas Uniforme -> Camisa: {worker.get('shirt_size','-')} | Pantalón: {worker.get('pants_size','-')} | Calzado: {worker.get('shoe_size','-')} | Braga: {worker.get('overall_size','-')}")
    c.drawString(50, 655, f"Estatus Actual: {evaluar_estatus_trabajador(worker)} | Usa Lentes: {worker.get('uses_glasses', 'No')}")
    c.drawString(50, 640, f"Última Dotación: {worker.get('last_dotation_date', 'N/A')} ({worker.get('dotation_status', 'Completa')}) - {worker.get('dotation_comments', 'Sin pendientes')}")
    
    c.drawString(50, 610, f"Contacto Emergencia: {worker['emergency_contact']['name']} ({worker['emergency_contact']['kinship']}) - {worker['emergency_contact']['phone']}")
    c.drawString(50, 595, f"Tipo de Sangre: {worker['blood_type']} | Alergias: {worker['allergies_meds']}")
    
    c.save()

    return FileResponse(path=pdf_path, filename=pdf_filename, media_type="application/pdf")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)