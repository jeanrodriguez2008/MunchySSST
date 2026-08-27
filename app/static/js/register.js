/**
 * MunchySSST - Registro con Carga de Imagen Real y Uso de Lentes
 */

function calcularTiempoServicio() {
    const inputFecha = document.getElementById('hire_date').value;
    const outputCampo = document.getElementById('service_time');

    if (!inputFecha) {
        outputCampo.value = '';
        return;
    }

    const fechaIngreso = new Date(inputFecha);
    const hoy = new Date();

    let años = hoy.getFullYear() - fechaIngreso.getFullYear();
    let meses = hoy.getMonth() - fechaIngreso.getMonth();
    let dias = hoy.getDate() - fechaIngreso.getDate();

    if (dias < 0) {
        meses--;
        const ultimoDiaMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0).getDate();
        dias += ultimoDiaMesAnterior;
    }

    if (meses < 0) {
        años--;
        meses += 12;
    }

    outputCampo.value = `${años} Años, ${meses} Meses y ${dias} Días`;
}

function agregarEstudio() {
    const container = document.getElementById('estudiosContainer');
    const div = document.createElement('div');
    div.className = 'dynamic-item d-flex gap-2 align-items-center';
    div.innerHTML = `
        <input type="text" class="form-control estudio-item" placeholder="Nombre de la carrera o estudio adicional">
        <button type="button" class="btn btn-outline-danger btn-sm" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(div);
}

function agregarCurso() {
    const container = document.getElementById('cursosContainer');
    const div = document.createElement('div');
    div.className = 'dynamic-item d-flex gap-2 align-items-center';
    div.innerHTML = `
        <input type="text" class="form-control curso-item" placeholder="Nombre del curso realizado">
        <button type="button" class="btn btn-outline-danger btn-sm" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(div);
}

function agregarCertificacion() {
    const container = document.getElementById('certificacionesContainer');
    const div = document.createElement('div');
    div.className = 'dynamic-item d-flex gap-2 align-items-center';
    div.innerHTML = `
        <input type="text" class="form-control certificacion-item" placeholder="Certificación obtenida">
        <button type="button" class="btn btn-outline-danger btn-sm" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(div);
}

function agregarReconocimiento() {
    const container = document.getElementById('reconocimientosContainer');
    const div = document.createElement('div');
    div.className = 'dynamic-item d-flex gap-2 align-items-center';
    div.innerHTML = `
        <input type="text" class="form-control reconocimiento-item" placeholder="Reconocimiento otorgado">
        <button type="button" class="btn btn-outline-danger btn-sm" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(div);
}

function agregarPatologia() {
    const container = document.getElementById('patologiasContainer');
    const div = document.createElement('div');
    div.className = 'dynamic-item';
    div.innerHTML = `
        <div class="row g-2">
            <div class="col-md-5"><input type="text" class="form-control patologia-nombre" placeholder="Nombre de la Patología"></div>
            <div class="col-md-6"><input type="text" class="form-control patologia-tratamiento" placeholder="Tratamiento"></div>
            <div class="col-md-1 text-end"><button type="button" class="btn btn-outline-danger btn-sm w-100" onclick="this.closest('.dynamic-item').remove()"><i class="fa-solid fa-trash"></i></button></div>
        </div>
    `;
    container.appendChild(div);
}

function agregarEvento() {
    const container = document.getElementById('eventosContainer');
    const div = document.createElement('div');
    div.className = 'dynamic-item';
    div.innerHTML = `
        <div class="row g-2">
            <div class="col-md-3"><input type="date" class="form-control evento-fecha"></div>
            <div class="col-md-3">
                <select class="form-select evento-tipo">
                    <option value="Accidente Laboral">Accidente Laboral</option>
                    <option value="Incidente">Incidente</option>
                    <option value="Enfermedad Ocupacional">Enfermedad Ocupacional</option>
                    <option value="Reposo Médico">Reposo Médico</option>
                </select>
            </div>
            <div class="col-md-5"><input type="text" class="form-control evento-descripcion" placeholder="Descripción"></div>
            <div class="col-md-1 text-end"><button type="button" class="btn btn-outline-danger btn-sm w-100" onclick="this.closest('.dynamic-item').remove()"><i class="fa-solid fa-trash"></i></button></div>
        </div>
    `;
    container.appendChild(div);
}

function recolectarValoresClase(nombreClase) {
    const elementos = document.querySelectorAll(`.${nombreClase}`);
    const valores = [];
    elementos.forEach(el => {
        if (el.value.trim() !== '') valores.push(el.value.trim());
    });
    return JSON.stringify(valores);
}

function recolectarPatologiasJSON() {
    const items = document.querySelectorAll('#patologiasContainer .dynamic-item');
    const patologias = [];
    items.forEach(item => {
        const nombre = item.querySelector('.patologia-nombre').value.trim();
        const tratamiento = item.querySelector('.patologia-tratamiento').value.trim();
        if (nombre !== '') patologias.push({ nombre, tratamiento });
    });
    return JSON.stringify(patologias);
}

function recolectarEventosJSON() {
    const items = document.querySelectorAll('#eventosContainer .dynamic-item');
    const eventos = [];
    items.forEach(item => {
        const fecha = item.querySelector('.evento-fecha').value;
        const tipo = item.querySelector('.evento-tipo').value;
        const descripcion = item.querySelector('.evento-descripcion').value.trim();
        if (descripcion !== '') eventos.push({ fecha, tipo, descripcion, rest_days: 0, is_reposo: false });
    });
    return JSON.stringify(eventos);
}

async function guardarTrabajador() {
    const btnGuardar = document.getElementById('btnGuardar');
    const formData = new FormData();

    formData.append('cedula', document.getElementById('cedula').value.trim());
    formData.append('first_name', document.getElementById('first_name').value.trim());
    formData.append('last_name', document.getElementById('last_name').value.trim());
    formData.append('birthdate', document.getElementById('birthdate').value);
    formData.append('phone', document.getElementById('phone').value.trim());
    formData.append('email', document.getElementById('email').value.trim());
    formData.append('address', document.getElementById('address').value.trim());
    formData.append('address_reference', document.getElementById('address_reference').value.trim());
    
    formData.append('emergency_name', document.getElementById('emergency_name').value.trim());
    formData.append('emergency_kinship', document.getElementById('emergency_kinship').value.trim());
    formData.append('emergency_phone', document.getElementById('emergency_phone').value.trim());

    formData.append('worker_code', document.getElementById('worker_code').value.trim());
    formData.append('position', document.getElementById('position').value.trim());
    formData.append('department', document.getElementById('department').value.trim());
    formData.append('supervisor', document.getElementById('supervisor').value.trim());
    formData.append('employment_type', document.getElementById('employment_type').value);
    formData.append('hire_date', document.getElementById('hire_date').value);
    formData.append('service_time', document.getElementById('service_time').value);

    formData.append('education_level', document.getElementById('education_level').value);
    formData.append('profession', document.getElementById('profession').value.trim());
    formData.append('additional_degrees_json', recolectarValoresClase('estudio-item'));
    formData.append('courses_json', recolectarValoresClase('curso-item'));
    formData.append('certifications_json', recolectarValoresClase('certificacion-item'));
    formData.append('awards_json', recolectarValoresClase('reconocimiento-item'));

    formData.append('blood_type', document.getElementById('blood_type').value);
    formData.append('uses_glasses', document.getElementById('uses_glasses').value);
    formData.append('allergies_meds', document.getElementById('allergies_meds').value.trim() || 'Ninguna');
    formData.append('allergies_food', document.getElementById('allergies_food').value.trim() || 'Ninguna');
    formData.append('chronic_treatment', document.getElementById('chronic_treatment').value.trim() || 'Ninguno');
    formData.append('disability_condition', document.getElementById('disability_condition').value.trim() || 'Ninguna');
    formData.append('pathologies_json', recolectarPatologiasJSON());
    formData.append('medical_events_json', recolectarEventosJSON());

    const photoFile = document.getElementById('photo_file').files[0];
    if (photoFile) {
        formData.append('photo_file', photoFile);
    }

    btnGuardar.disabled = true;
    btnGuardar.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Guardando...';

    try {
        const response = await fetch('/api/workers/create', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            mostrarAlerta('¡Trabajador registrado exitosamente! Redirigiendo...', 'success');
            setTimeout(() => { window.location.href = '/'; }, 1500);
        } else {
            mostrarAlerta(result.detail || 'Error al guardar.', 'danger');
            btnGuardar.disabled = false;
            btnGuardar.innerHTML = '<i class="fa-solid fa-floppy-disk me-2"></i>Guardar Trabajador';
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error de comunicación local.', 'danger');
        btnGuardar.disabled = false;
        btnGuardar.innerHTML = '<i class="fa-solid fa-floppy-disk me-2"></i>Guardar Trabajador';
    }
}

function mostrarAlerta(mensaje, tipo) {
    const alertContainer = document.getElementById('alertContainer');
    alertContainer.className = `alert alert-${tipo} text-center mb-4`;
    alertContainer.innerHTML = mensaje;
    alertContainer.style.display = 'block';
}