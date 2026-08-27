import sys
import os
import json
import shutil
from pathlib import Path
from datetime import datetime
from collections import Counter

sys.path.append(str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, Request, HTTPException, Form, File, UploadFile, Response, Depends
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import pandas as pd
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import uvicorn

app = FastAPI(title="MunchySSST Local")

# --- SOLUCIÓN PARA RENDER: RUTAS ABSOLUTAS BASADAS EN LA UBICACIÓN DEL ARCHIVO ---
BASE_DIR = Path(__file__).resolve().parent

os.makedirs(BASE_DIR / "static/uploads", exist_ok=True)
os.makedirs(BASE_DIR / "static/img", exist_ok=True)
os.makedirs(BASE_DIR / "static/exports", exist_ok=True)

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
# ----------------------------------------------------------------------------------

class EventSchema(BaseModel):
    fecha: Optional[str] = ""
    tipo: Optional[str] = ""
    descripcion: str
    rest_days: Optional[int] = 0
    is_reposo: Optional[bool] = False

MOCK_USERS: Dict[str, Any] = {
    "webmaster": {
        "username": "webmaster",
        "password": "web123456",
        "role": "Webmaster",
        "security_question": "¿Nombre de tu primera mascota?",
        "security_answer": "purro"
    }
}

# Diccionario inicializado vacío para evitar que reaparezcan registros por defecto
MOCK_WORKERS: Dict[str, Any] = {}

def get_current_user(request: Request):
    username = request.cookies.get("session_user")
    if not username or username not in MOCK_USERS:
        return None
    return MOCK_USERS[username]

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

# --- AUTENTICACIÓN Y VISTAS ---

@app.get("/login")
def login_view(request: Request):
    return templates.TemplateResponse(request=request, name="login.html")

@app.post("/api/auth/login")
def login_api(username: str = Form(...), password: str = Form(...), response: Response = None):
    user = MOCK_USERS.get(username.lower().strip())
    if not user or user["password"] != password:
        raise HTTPException(status_code=400, detail="Nombre de usuario o contraseña incorrectos.")
    
    res = RedirectResponse(url="/", status_code=303)
    res.set_cookie(key="session_user", value=user["username"], httponly=True)
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
    uname = username.lower().strip()
    if uname in MOCK_USERS:
        raise HTTPException(status_code=400, detail="El nombre de usuario ya se encuentra registrado.")
    
    MOCK_USERS[uname] = {
        "username": uname,
        "password": password,
        "role": "Analista",
        "security_question": security_question,
        "security_answer": security_answer.lower().strip()
    }
    return {"message": "Usuario registrado exitosamente."}

@app.get("/api/auth/get-security-question/{username}")
def get_security_question(username: str):
    uname = username.lower().strip()
    user = MOCK_USERS.get(uname)
    if not user:
        raise HTTPException(status_code=404, detail="El usuario no se encuentra registrado.")
    return {"security_question": user.get("security_question", "Pregunta no configurada.")}

@app.post("/api/auth/recover")
def recover_password(
    username: str = Form(...),
    security_answer: str = Form(...),
    new_password: str = Form(...)
):
    uname = username.lower().strip()
    user = MOCK_USERS.get(uname)
    if not user:
        raise HTTPException(status_code=404, detail="El usuario especificado no existe.")
    
    if user["security_answer"] != security_answer.lower().strip():
        raise HTTPException(status_code=400, detail="La respuesta a la pregunta de seguridad es incorrecta.")
    
    user["password"] = new_password
    return {"message": "Contraseña actualizada exitosamente."}

@app.get("/")
def home(request: Request):
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    return templates.TemplateResponse(request=request, name="worker_profile.html", context={"current_user": user})

@app.get("/register")
def register_page(request: Request):
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    return templates.TemplateResponse(request=request, name="register_worker.html", context={"current_user": user})

@app.get("/users")
def users_management_page(request: Request):
    user = get_current_user(request)
    if not user or user["role"] not in ["Webmaster", "Coordinador"]:
        return RedirectResponse(url="/")
    return templates.TemplateResponse(request=request, name="user_management.html", context={"current_user": user})

# --- GESTIÓN DE USUARIOS Y ROLES ---

@app.get("/api/users/list")
def list_users(request: Request):
    user = get_current_user(request)
    if not user or user["role"] not in ["Webmaster", "Coordinador"]:
        raise HTTPException(status_code=403, detail="Acceso denegado a la gestión de usuarios.")
    
    users_list = []
    for u in MOCK_USERS.values():
        if user["role"] == "Coordinador" and u["role"] == "Webmaster":
            continue
            
        users_list.append({
            "username": u["username"],
            "role": u["role"],
            "security_question": u["security_question"]
        })
    return users_list

@app.put("/api/users/update-role")
def update_user_role(username: str = Form(...), new_role: str = Form(...), request: Request = None):
    current = get_current_user(request)
    if not current or current["role"] not in ["Webmaster", "Coordinador"]:
        raise HTTPException(status_code=403, detail="Acceso denegado.")
    
    target_user = MOCK_USERS.get(username.lower().strip())
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    
    target_user["role"] = new_role
    return {"message": f"El rol de {username} ha sido actualizado a {new_role}."}

@app.delete("/api/users/delete/{username}")
def delete_user(username: str, request: Request):
    current = get_current_user(request)
    if not current or current["role"] not in ["Webmaster", "Coordinador"]:
        raise HTTPException(status_code=403, detail="Acceso denegado.")
    
    uname = username.lower().strip()
    target_user = MOCK_USERS.get(uname)
    
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    
    if target_user["role"] == "Webmaster":
        raise HTTPException(status_code=400, detail="La cuenta principal de Webmaster no puede ser eliminada.")
    
    del MOCK_USERS[uname]
    return {"message": f"El usuario '{username}' ha sido eliminado exitosamente."}

# --- ENDPOINTS DASHBOARD Y TRABAJADORES ---

@app.get("/api/dashboard/stats")
def get_dashboard_stats():
    # Si la lista de trabajadores está vacía, retornar 0 en todo y listas vacías para gráficos
    if not MOCK_WORKERS:
        return {
            "total_trabajadores": 0,
            "total_reposo": 0,
            "total_lentes": 0,
            "total_discapacidad": 0,
            "total_cronicas": 0,
            "dias_sin_accidentes_empresa": 0,
            "gerencias_stats": [],
            "top_cronicas": []
        }

    total_trabajadores = len(MOCK_WORKERS)
    total_reposo = sum(1 for w in MOCK_WORKERS.values() if w.get("is_on_leave"))
    total_lentes = sum(1 for w in MOCK_WORKERS.values() if w.get("uses_glasses") == "Sí")
    total_discapacidad = sum(1 for w in MOCK_WORKERS.values() if w.get("disability_condition") and w.get("disability_condition").strip().lower() != "ninguna")
    total_cronicas = sum(1 for w in MOCK_WORKERS.values() if len(w.get("pathologies", [])) > 0 or (w.get("chronic_treatment") and w.get("chronic_treatment").strip().lower() != "ninguno"))

    fechas_accidentes_empresa = []
    accidentes_por_gerencia: Dict[str, List[datetime]] = {}
    departamentos_existentes = set()

    for w in MOCK_WORKERS.values():
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

    if fechas_accidentes_empresa:
        dias_sin_accidentes_empresa = (hoy - max(fechas_accidentes_empresa)).days
    else:
        dias_sin_accidentes_empresa = 0

    stats_gerencias = []
    for dept in sorted(departamentos_existentes):
        fechas_dept = accidentes_por_gerencia.get(dept, [])
        if fechas_dept:
            dias_dept = (hoy - max(fechas_dept)).days
        else:
            dias_dept = 0

        stats_gerencias.append({
            "gerencia": dept,
            "dias_sin_accidentes": max(dias_dept, 0)
        })

    patologias_lista = []
    for w in MOCK_WORKERS.values():
        for p in w.get("pathologies", []):
            if p.get("nombre"):
                patologias_lista.append(p["nombre"].strip().title())
    
    conteo = Counter(patologias_lista)
    top_3 = [{"nombre": k, "cantidad": v} for k, v in conteo.most_common(3)]

    return {
        "total_trabajadores": total_trabajadores,
        "total_reposo": total_reposo,
        "total_lentes": total_lentes,
        "total_discapacidad": total_discapacidad,
        "total_cronicas": total_cronicas,
        "dias_sin_accidentes_empresa": max(dias_sin_accidentes_empresa, 0),
        "gerencias_stats": stats_gerencias,
        "top_cronicas": top_3
    }

@app.get("/api/workers/search/{cedula}")
def search_worker(cedula: str):
    worker = MOCK_WORKERS.get(cedula)
    if not worker:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado")
    
    worker_copy = dict(worker)
    worker_copy["days_without_rest"] = calcular_dias_sin_reposo(worker)
    return worker_copy

@app.post("/api/workers/create")
async def create_worker(
    cedula: str = Form(...),
    first_name: str = Form(...),
    last_name: str = Form(...),
    birthdate: str = Form(...),
    phone: str = Form(""),
    email: str = Form(...),
    address: str = Form(...),
    address_reference: str = Form(...),
    emergency_name: str = Form(...),
    emergency_kinship: str = Form(...),
    emergency_phone: str = Form(...),
    worker_code: str = Form(...),
    position: str = Form(...),
    department: str = Form(...),
    supervisor: str = Form(""),
    employment_type: str = Form(...),
    hire_date: str = Form(...),
    service_time: str = Form(""),
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
    photo_file: Optional[UploadFile] = File(None)
):
    if cedula in MOCK_WORKERS:
        raise HTTPException(status_code=400, detail="La cédula ya se encuentra registrada.")

    photo_url = "/static/uploads/default_avatar.png"
    if photo_file and photo_file.filename:
        file_ext = Path(photo_file.filename).suffix
        filename = f"photo_{cedula}{file_ext}"
        filepath = BASE_DIR / "static/uploads" / filename
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(photo_file.file, buffer)
        photo_url = f"/static/uploads/{filename}"

    new_worker = {
        "cedula": cedula,
        "first_name": first_name,
        "last_name": last_name,
        "birthdate": birthdate,
        "phone": phone,
        "email": email,
        "address": address,
        "address_reference": address_reference,
        "emergency_contact": {
            "name": emergency_name,
            "kinship": emergency_kinship,
            "phone": emergency_phone
        },
        "worker_code": worker_code,
        "position": position,
        "department": department,
        "supervisor": supervisor,
        "employment_type": employment_type,
        "hire_date": hire_date,
        "service_time": service_time,
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
        "photo_url": photo_url,
        "is_on_leave": False,
        "leave_days": 0,
        "leave_reason": ""
    }

    MOCK_WORKERS[cedula] = new_worker
    return {"message": "Trabajador registrado exitosamente", "cedula": cedula}

@app.put("/api/workers/update/{cedula}")
async def update_worker(
    cedula: str,
    first_name: str = Form(...),
    last_name: str = Form(...),
    birthdate: str = Form(...),
    phone: str = Form(""),
    email: str = Form(...),
    address: str = Form(...),
    address_reference: str = Form(...),
    emergency_name: str = Form(...),
    emergency_kinship: str = Form(...),
    emergency_phone: str = Form(...),
    worker_code: str = Form(...),
    position: str = Form(...),
    department: str = Form(...),
    supervisor: str = Form(""),
    employment_type: str = Form(...),
    hire_date: str = Form(...),
    service_time: str = Form(""),
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
    photo_file: Optional[UploadFile] = File(None)
):
    worker = MOCK_WORKERS.get(cedula)
    if not worker:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")

    worker["first_name"] = first_name
    worker["last_name"] = last_name
    worker["birthdate"] = birthdate
    worker["phone"] = phone
    worker["email"] = email
    worker["address"] = address
    worker["address_reference"] = address_reference
    
    worker["emergency_contact"] = {
        "name": emergency_name,
        "kinship": emergency_kinship,
        "phone": emergency_phone
    }

    worker["worker_code"] = worker_code
    worker["position"] = position
    worker["department"] = department
    worker["supervisor"] = supervisor
    worker["employment_type"] = employment_type
    worker["hire_date"] = hire_date
    worker["service_time"] = service_time

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

    if photo_file and photo_file.filename:
        file_ext = Path(photo_file.filename).suffix
        filename = f"photo_{cedula}{file_ext}"
        filepath = BASE_DIR / "static/uploads" / filename
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(photo_file.file, buffer)
        worker["photo_url"] = f"/static/uploads/{filename}"

    return {"message": "Expediente actualizado exitosamente"}

@app.post("/api/workers/discharge/{cedula}")
def discharge_worker(cedula: str):
    worker = MOCK_WORKERS.get(cedula)
    if not worker:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")
    
    worker["is_on_leave"] = False
    worker["leave_days"] = 0
    worker["leave_reason"] = ""
    return {"message": "Trabajador dado de alta exitosamente"}

@app.post("/api/workers/add-event/{cedula}")
def add_event(cedula: str, event: EventSchema):
    worker = MOCK_WORKERS.get(cedula)
    if not worker:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")
    
    worker["medical_events"].append(event.dict())

    if event.is_reposo and event.tipo == "Reposo Médico":
        worker["is_on_leave"] = True
        worker["leave_days"] = event.rest_days
        worker["leave_reason"] = event.descripcion
    
    return {"message": "Evento registrado exitosamente"}

@app.delete("/api/workers/delete/{cedula}")
def delete_worker(cedula: str):
    if cedula not in MOCK_WORKERS:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado para eliminar")
    del MOCK_WORKERS[cedula]
    return {"message": f"Trabajador C.I. {cedula} eliminado correctamente."}

@app.get("/api/workers/export/excel")
def export_excel():
    if not MOCK_WORKERS:
        raise HTTPException(status_code=400, detail="No hay trabajadores registrados.")

    records = []
    for w in MOCK_WORKERS.values():
        records.append({
            "Código Trabajador": w.get("worker_code", ""),
            "Cédula": w.get("cedula", ""),
            "Estatus Reposo": "EN REPOSO" if w.get("is_on_leave") else "ACTIVO",
            "Nombres": w.get("first_name", ""),
            "Apellidos": w.get("last_name", ""),
            "Cargo": w.get("position", ""),
            "Departamento": w.get("department", ""),
            "Usa Lentes": w.get("uses_glasses", "No"),
            "Fecha Ingreso": w.get("hire_date", ""),
            "Tiempo Servicio": w.get("service_time", "")
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
    worker = MOCK_WORKERS.get(cedula)
    if not worker:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")

    pdf_filename = f"Ficha_Trabajador_{cedula}.pdf"
    pdf_path = str(BASE_DIR / f"static/exports/{pdf_filename}")
    
    c = canvas.Canvas(pdf_path, pagesize=letter)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, 750, "ALIMENTOS MUNCHY, C.A. - FICHA DE SALUD Y SEGURIDAD")
    
    c.setFont("Helvetica", 10)
    c.drawString(50, 730, f"Cédula: V-{worker['cedula']} | Código: {worker['worker_code']}")
    c.drawString(50, 715, f"Nombre Completo: {worker['first_name']} {worker['last_name']}")
    c.drawString(50, 700, f"Cargo: {worker['position']} | Departamento: {worker['department']}")
    c.drawString(50, 685, f"Fecha de Ingreso: {worker['hire_date']} ({worker.get('service_time', '')})")
    c.drawString(50, 670, f"Usa Lentes: {worker.get('uses_glasses', 'No')} | Estatus Actual: {'EN REPOSO' if worker.get('is_on_leave') else 'ACTIVO'}")
    
    c.drawString(50, 640, f"Contacto Emergencia: {worker['emergency_contact']['name']} ({worker['emergency_contact']['kinship']}) - {worker['emergency_contact']['phone']}")
    c.drawString(50, 625, f"Tipo de Sangre: {worker['blood_type']} | Alergias: {worker['allergies_meds']}")
    
    c.save()

    return FileResponse(path=pdf_path, filename=pdf_filename, media_type="application/pdf")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)