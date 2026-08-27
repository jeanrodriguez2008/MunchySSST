let cedulaActualConsulta = '';
let datosTrabajadorActual = null;
let chartInstance = null;
let chartReporteSaludInstance = null;
let chartReporteSeguridadInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    cargarDashboardGlobal();
    aplicarPermisosRBAC();
});

function formatearFecha(fechaStr) {
    if (!fechaStr) return 'N/A';
    const partes = fechaStr.split('-');
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return fechaStr;
}

async function cargarDashboardGlobal() {
    try {
        const response = await fetch('/api/dashboard/stats');
        if (!response.ok) return;
        const stats = await response.json();

        document.getElementById('dashDiasEmpresa').textContent = `${stats.dias_sin_accidentes_empresa || 0} Días`;
        document.getElementById('dashReposo').textContent = stats.total_reposo || 0;
        document.getElementById('dashLentes').textContent = stats.total_lentes || 0;
        document.getElementById('dashDiscapacidad').textContent = stats.total_discapacidad || 0;
        document.getElementById('dashCronicas').textContent = stats.total_cronicas || 0;

        renderizarTablaGerencias(stats.gerencias_stats || []);
        renderizarGraficoTopCronicas(stats.top_cronicas || []);
    } catch (e) {
        console.error('Error al cargar dashboard:', e);
    }
}

function renderizarTablaGerencias(gerencias) {
    const tbody = document.getElementById('tableGerenciasBody');
    tbody.innerHTML = '';

    if (!gerencias || gerencias.length === 0) {
        tbody.innerHTML = `<tr><td colspan="2" class="text-center text-muted">No hay gerencias registradas.</td></tr>`;
        return;
    }

    gerencias.forEach(g => {
        tbody.innerHTML += `
            <tr>
                <td class="fw-semibold"><i class="fa-solid fa-building me-2 text-danger"></i>${g.gerencia}</td>
                <td class="text-end fw-bold text-success"><span class="badge bg-success">${g.dias_sin_accidentes} Días</span></td>
            </tr>
        `;
    });
}

function renderizarGraficoTopCronicas(topData) {
    const ctx = document.getElementById('topCronicasChart').getContext('2d');
    
    const labels = topData.map(item => item.nombre);
    const data = topData.map(item => item.cantidad);

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.length > 0 ? labels : ['Sin Datos'],
            datasets: [{
                label: 'Cantidad de Trabajadores',
                data: data.length > 0 ? data : [0],
                backgroundColor: ['#d9251d', '#ffc107', '#0d6efd'],
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

async function generarInformeInteligente() {
    try {
        const response = await fetch('/api/dashboard/stats');
        if (!response.ok) return;
        const stats = await response.json();

        const hoy = new Date();
        document.getElementById('reportFechaGeneracion').textContent = `Fecha: ${hoy.getDate().toString().padStart(2, '0')}/${(hoy.getMonth()+1).toString().padStart(2, '0')}/${hoy.getFullYear()}`;

        let analisisText = `En el marco del **Servicio de Seguridad y Salud en el Trabajo**, la empresa mantiene un récord global óptimo de **${stats.dias_sin_accidentes_empresa} días consecutivos sin accidentes laborales**. `;
        
        if (stats.total_reposo === 0) {
            analisisText += `Actualmente **no existen trabajadores en reposo médico**, lo que representa una tasa de ausentismo del 0.0%. `;
        } else {
            analisisText += `Actualmente se registra un ausentismo activo de **${stats.total_reposo} trabajador(es) en reposo médico**. `;
        }

        if (stats.total_cronicas > 0) {
            const patologiaPrincipal = stats.top_cronicas[0] ? stats.top_cronicas[0].nombre : 'Patologías no especificadas';
            analisisText += `En el ámbito de Salud Ocupacional, se identificaron **${stats.total_cronicas} caso(s) de condiciones crónicas**, teniendo mayor prevalencia la categoría de **${patologiaPrincipal}**. `;
        } else {
            analisisText += `No se registran diagnósticos de enfermedades crónicas activas en la plantilla. `;
        }

        analisisText += `Se registra un total de **${stats.total_lentes} trabajador(es)** con uso de corrección visual (lentes) y **${stats.total_discapacidad} caso(s)** con condición de discapacidad legalmente notificada.`;

        document.getElementById('resumenTextoInteligente').innerHTML = analisisText;

        const modal = new bootstrap.Modal(document.getElementById('modalInformeInteligente'));
        modal.show();

        setTimeout(() => {
            renderizarGraficosInforme(stats);
        }, 300);

    } catch (e) {
        console.error('Error generando informe:', e);
    }
}

function renderizarGraficosInforme(stats) {
    const ctxSalud = document.getElementById('chartReporteSalud').getContext('2d');
    if (chartReporteSaludInstance) chartReporteSaludInstance.destroy();

    chartReporteSaludInstance = new Chart(ctxSalud, {
        type: 'doughnut',
        data: {
            labels: ['En Reposo', 'Usan Lentes', 'Discapacidad', 'Enf. Crónicas'],
            datasets: [{
                data: [stats.total_reposo, stats.total_lentes, stats.total_discapacidad, stats.total_cronicas],
                backgroundColor: ['#d9251d', '#0d6efd', '#ffc107', '#0dcaf0']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });

    const ctxSeguridad = document.getElementById('chartReporteSeguridad').getContext('2d');
    if (chartReporteSeguridadInstance) chartReporteSeguridadInstance.destroy();

    const labelsGerencias = stats.gerencias_stats.map(g => g.gerencia);
    const dataGerencias = stats.gerencias_stats.map(g => g.dias_sin_accidentes);

    chartReporteSeguridadInstance = new Chart(ctxSeguridad, {
        type: 'bar',
        data: {
            labels: labelsGerencias.length > 0 ? labelsGerencias : ['Empresa General'],
            datasets: [{
                label: 'Días Sin Accidentes',
                data: dataGerencias.length > 0 ? dataGerencias : [stats.dias_sin_accidentes_empresa],
                backgroundColor: '#198754',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function aplicarPermisosRBAC() {
    const rolSesion = document.getElementById('userRoleSession')?.value || 'Analista';

    const btnEditar = document.getElementById('btnEditarRegistro');
    const btnEliminar = document.getElementById('btnEliminarRegistro');
    const btnDarDeAlta = document.getElementById('btnDarDeAlta');
    const btnNuevoEvento = document.getElementById('btnNuevoEvento');
    const btnExportExcel = document.getElementById('btnExportExcel');
    const btnRegisterWorker = document.getElementById('btnRegisterWorker');

    if (rolSesion === 'Webmaster') {
        if (btnEditar) btnEditar.style.display = 'block';
        if (btnEliminar) btnEliminar.style.display = 'block';
        if (btnDarDeAlta) btnDarDeAlta.style.display = 'block';
        if (btnNuevoEvento) btnNuevoEvento.style.display = 'block';
        if (btnExportExcel) btnExportExcel.style.display = 'inline-block';
        if (btnRegisterWorker) btnRegisterWorker.style.display = 'inline-block';
    } else if (rolSesion === 'Coordinador') {
        if (btnEditar) btnEditar.style.display = 'block';
        if (btnEliminar) btnEliminar.style.display = 'none';
        if (btnDarDeAlta) btnDarDeAlta.style.display = 'block';
        if (btnNuevoEvento) btnNuevoEvento.style.display = 'block';
        if (btnExportExcel) btnExportExcel.style.display = 'inline-block';
        if (btnRegisterWorker) btnRegisterWorker.style.display = 'inline-block';
    } else if (rolSesion === 'Analista') {
        if (btnEditar) btnEditar.style.display = 'none';
        if (btnEliminar) btnEliminar.style.display = 'none';
        if (btnDarDeAlta) btnDarDeAlta.style.display = 'none';
        if (btnNuevoEvento) btnNuevoEvento.style.display = 'block';
        if (btnExportExcel) btnExportExcel.style.display = 'none';
        if (btnRegisterWorker) btnRegisterWorker.style.display = 'none';
    }
}

async function buscarTrabajador() {
    const cedula = document.getElementById('cedulaInput').value.trim();
    const alertContainer = document.getElementById('alertContainer');
    const profileContainer = document.getElementById('workerProfileContainer');

    if (!cedula) {
        mostrarAlerta('Por favor ingrese un número de cédula válido.', 'warning');
        return;
    }

    cedulaActualConsulta = cedula;
    profileContainer.style.display = 'none';
    mostrarAlerta('<i class="fa-solid fa-spinner fa-spin me-2"></i> Consultando base de datos...', 'info');

    try {
        const response = await fetch(`/api/workers/search/${cedula}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                mostrarAlerta(`No se encontró ningún trabajador con la cédula <strong>${cedula}</strong>.`, 'danger');
            } else {
                mostrarAlerta('Error en el servidor al consultar los datos.', 'danger');
            }
            return;
        }

        const data = await response.json();
        datosTrabajadorActual = data;
        alertContainer.style.display = 'none';
        renderizarDatosTrabajador(data);
        profileContainer.style.display = 'block';
        aplicarPermisosRBAC();

    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error de comunicación local.', 'danger');
    }
}

function renderizarDatosTrabajador(data) {
    document.getElementById('workerPhoto').src = data.photo_url || '/static/uploads/default_avatar.png';
    document.getElementById('workerFullName').textContent = `${data.first_name} ${data.last_name}`;
    document.getElementById('workerCodeBadge').textContent = data.worker_code || 'SIN CÓDIGO';
    document.getElementById('workerCedula').textContent = `C.I.: V-${data.cedula}`;
    document.getElementById('workerCargo').textContent = data.position || 'N/A';
    document.getElementById('workerDept').textContent = data.department || 'N/A';
    document.getElementById('workerJefe').textContent = data.supervisor || 'N/A';

    document.getElementById('workerDaysWithoutRest').textContent = `${data.days_without_rest || 0} Días`;

    const statusBadge = document.getElementById('workerStatusBadge');
    const reposoContainer = document.getElementById('reposoDetailsContainer');

    if (data.is_on_leave) {
        statusBadge.className = 'badge bg-warning text-dark badge-status';
        statusBadge.innerHTML = '<i class="fa-solid fa-bed-pulse me-1"></i>EN REPOSO';
        
        document.getElementById('reposoDaysText').textContent = `EN REPOSO MÉDICO (${data.leave_days || 0} DÍAS)`;
        document.getElementById('reposoCausaText').textContent = `Diagnóstico: ${data.leave_reason || 'No especificado'}`;
        reposoContainer.style.display = 'block';
    } else {
        statusBadge.className = 'badge bg-success badge-status';
        statusBadge.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i>ACTIVO';
        reposoContainer.style.display = 'none';
    }

    document.getElementById('workerBirthdate').textContent = formatearFecha(data.birthdate);
    document.getElementById('workerPhone').textContent = data.phone || 'N/A';
    document.getElementById('workerEmail').textContent = data.email || 'N/A';
    document.getElementById('workerAddress').textContent = data.address || 'N/A';
    document.getElementById('workerReference').textContent = data.address_reference || 'N/A';

    if (data.emergency_contact) {
        document.getElementById('emergencyName').textContent = data.emergency_contact.name || 'N/A';
        document.getElementById('emergencyKinship').textContent = data.emergency_contact.kinship || 'N/A';
        document.getElementById('emergencyPhone').textContent = data.emergency_contact.phone || 'N/A';
    }

    document.getElementById('workerCode').textContent = data.worker_code || 'N/A';
    document.getElementById('workerHireDate').textContent = formatearFecha(data.hire_date);
    document.getElementById('workerServiceTime').textContent = data.service_time || 'N/A';
    document.getElementById('workerCondition').textContent = data.employment_type || 'N/A';
    document.getElementById('workerConditionBadge').textContent = (data.employment_type || 'FIJO').toUpperCase();

    document.getElementById('workerEducation').textContent = data.education_level || 'N/A';
    document.getElementById('workerDegree').textContent = data.profession || 'N/A';

    renderizarLista('workerAdditionalDegrees', data.additional_degrees);
    renderizarLista('workerCourses', data.courses);
    renderizarLista('workerCertifications', data.certifications);
    renderizarLista('workerAwards', data.awards);

    document.getElementById('workerBloodType').textContent = data.blood_type || 'N/A';
    document.getElementById('workerUsesGlasses').textContent = data.uses_glasses || 'No';
    document.getElementById('workerAllergiesMeds').textContent = data.allergies_meds || 'Ninguna';
    document.getElementById('workerAllergiesFood').textContent = data.allergies_food || 'Ninguna';
    document.getElementById('workerChronicTreatment').textContent = data.chronic_treatment || 'Ninguno';
    document.getElementById('workerDisability').textContent = data.disability_condition || 'Ninguna';

    const eventsTableBody = document.getElementById('eventsTableBody');
    eventsTableBody.innerHTML = '';
    if (data.medical_events && data.medical_events.length > 0) {
        data.medical_events.forEach(ev => {
            eventsTableBody.innerHTML += `
                <tr>
                    <td>${formatearFecha(ev.fecha)}</td>
                    <td><span class="badge ${ev.tipo === 'Reposo Médico' ? 'bg-warning text-dark' : 'bg-danger'}">${ev.tipo || 'Evento'}</span></td>
                    <td>${ev.rest_days ? ev.rest_days + ' Días' : 'N/A'}</td>
                    <td>${ev.descripcion}</td>
                    <td><span class="badge ${ev.is_reposo ? 'bg-warning text-dark' : 'bg-success'}">${ev.is_reposo ? 'En Reposo' : 'Activo'}</span></td>
                </tr>
            `;
        });
    } else {
        eventsTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Sin eventos registrados.</td></tr>`;
    }
}

function renderizarLista(elementId, arrayDatos) {
    const contenedor = document.getElementById(elementId);
    contenedor.innerHTML = '';
    if (arrayDatos && arrayDatos.length > 0) {
        arrayDatos.forEach(item => {
            contenedor.innerHTML += `<li class="list-group-item"><i class="fa-solid fa-check text-success me-2"></i>${item}</li>`;
        });
    } else {
        contenedor.innerHTML = `<li class="list-group-item text-muted">Sin registros agregados.</li>`;
    }
}

function calcularTiempoServicioEdicion() {
    const inputFecha = document.getElementById('edit_hire_date').value;
    const outputCampo = document.getElementById('edit_service_time');

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

function agregarCampoEditEstudio(valor = '') {
    const container = document.getElementById('editEstudiosContainer');
    const div = document.createElement('div');
    div.className = 'dynamic-item-edit d-flex gap-2 align-items-center';
    div.innerHTML = `
        <input type="text" class="form-control edit-estudio-item" value="${valor}" placeholder="Estudio o carrera adicional">
        <button type="button" class="btn btn-outline-danger btn-sm" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(div);
}

function agregarCampoEditCurso(valor = '') {
    const container = document.getElementById('editCursosContainer');
    const div = document.createElement('div');
    div.className = 'dynamic-item-edit d-flex gap-2 align-items-center';
    div.innerHTML = `
        <input type="text" class="form-control edit-curso-item" value="${valor}" placeholder="Nombre del curso realizado">
        <button type="button" class="btn btn-outline-danger btn-sm" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(div);
}

function agregarCampoEditCertificacion(valor = '') {
    const container = document.getElementById('editCertificacionesContainer');
    const div = document.createElement('div');
    div.className = 'dynamic-item-edit d-flex gap-2 align-items-center';
    div.innerHTML = `
        <input type="text" class="form-control edit-certificacion-item" value="${valor}" placeholder="Certificación obtenida">
        <button type="button" class="btn btn-outline-danger btn-sm" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(div);
}

function agregarCampoEditReconocimiento(valor = '') {
    const container = document.getElementById('editReconocimientosContainer');
    const div = document.createElement('div');
    div.className = 'dynamic-item-edit d-flex gap-2 align-items-center';
    div.innerHTML = `
        <input type="text" class="form-control edit-reconocimiento-item" value="${valor}" placeholder="Reconocimiento otorgado">
        <button type="button" class="btn btn-outline-danger btn-sm" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(div);
}

function agregarCampoEditPatologia(nombre = '', tratamiento = '') {
    const container = document.getElementById('editPatologiasContainer');
    const div = document.createElement('div');
    div.className = 'dynamic-item-edit';
    div.innerHTML = `
        <div class="row g-2">
            <div class="col-md-5"><input type="text" class="form-control edit-patologia-nombre" value="${nombre}" placeholder="Patología / Enfermedad"></div>
            <div class="col-md-6"><input type="text" class="form-control edit-patologia-tratamiento" value="${tratamiento}" placeholder="Tratamiento"></div>
            <div class="col-md-1 text-end"><button type="button" class="btn btn-outline-danger btn-sm w-100" onclick="this.closest('.dynamic-item-edit').remove()"><i class="fa-solid fa-trash"></i></button></div>
        </div>
    `;
    container.appendChild(div);
}

function abrirModalEditar() {
    if (!datosTrabajadorActual) return;

    document.getElementById('edit_cedula').value = datosTrabajadorActual.cedula;
    document.getElementById('edit_first_name').value = datosTrabajadorActual.first_name;
    document.getElementById('edit_last_name').value = datosTrabajadorActual.last_name;
    document.getElementById('edit_birthdate').value = datosTrabajadorActual.birthdate || '';
    document.getElementById('edit_phone').value = datosTrabajadorActual.phone || '';
    document.getElementById('edit_email').value = datosTrabajadorActual.email || '';
    document.getElementById('edit_address').value = datosTrabajadorActual.address || '';
    document.getElementById('edit_address_reference').value = datosTrabajadorActual.address_reference || '';

    if (datosTrabajadorActual.emergency_contact) {
        document.getElementById('edit_emergency_name').value = datosTrabajadorActual.emergency_contact.name || '';
        document.getElementById('edit_emergency_kinship').value = datosTrabajadorActual.emergency_contact.kinship || '';
        document.getElementById('edit_emergency_phone').value = datosTrabajadorActual.emergency_contact.phone || '';
    }

    document.getElementById('edit_worker_code').value = datosTrabajadorActual.worker_code;
    document.getElementById('edit_position').value = datosTrabajadorActual.position;
    document.getElementById('edit_department').value = datosTrabajadorActual.department;
    document.getElementById('edit_supervisor').value = datosTrabajadorActual.supervisor || '';
    document.getElementById('edit_employment_type').value = datosTrabajadorActual.employment_type;
    document.getElementById('edit_hire_date').value = datosTrabajadorActual.hire_date || '';
    document.getElementById('edit_service_time').value = datosTrabajadorActual.service_time || '';

    document.getElementById('edit_education_level').value = datosTrabajadorActual.education_level;
    document.getElementById('edit_profession').value = datosTrabajadorActual.profession || '';

    const containerEstudios = document.getElementById('editEstudiosContainer');
    containerEstudios.innerHTML = '';
    if (datosTrabajadorActual.additional_degrees && datosTrabajadorActual.additional_degrees.length > 0) {
        datosTrabajadorActual.additional_degrees.forEach(val => agregarCampoEditEstudio(val));
    }

    const containerCursos = document.getElementById('editCursosContainer');
    containerCursos.innerHTML = '';
    if (datosTrabajadorActual.courses && datosTrabajadorActual.courses.length > 0) {
        datosTrabajadorActual.courses.forEach(val => agregarCampoEditCurso(val));
    }

    const containerCertificaciones = document.getElementById('editCertificacionesContainer');
    containerCertificaciones.innerHTML = '';
    if (datosTrabajadorActual.certifications && datosTrabajadorActual.certifications.length > 0) {
        datosTrabajadorActual.certifications.forEach(val => agregarCampoEditCertificacion(val));
    }

    const containerReconocimientos = document.getElementById('editReconocimientosContainer');
    containerReconocimientos.innerHTML = '';
    if (datosTrabajadorActual.awards && datosTrabajadorActual.awards.length > 0) {
        datosTrabajadorActual.awards.forEach(val => agregarCampoEditReconocimiento(val));
    }

    document.getElementById('edit_blood_type').value = datosTrabajadorActual.blood_type;
    document.getElementById('edit_uses_glasses').value = datosTrabajadorActual.uses_glasses || 'No';
    document.getElementById('edit_allergies_meds').value = datosTrabajadorActual.allergies_meds || '';
    document.getElementById('edit_allergies_food').value = datosTrabajadorActual.allergies_food || '';
    document.getElementById('edit_chronic_treatment').value = datosTrabajadorActual.chronic_treatment || '';
    document.getElementById('edit_disability_condition').value = datosTrabajadorActual.disability_condition || '';

    const containerPatologias = document.getElementById('editPatologiasContainer');
    containerPatologias.innerHTML = '';
    if (datosTrabajadorActual.pathologies && datosTrabajadorActual.pathologies.length > 0) {
        datosTrabajadorActual.pathologies.forEach(p => agregarCampoEditPatologia(p.nombre, p.tratamiento));
    }

    const modal = new bootstrap.Modal(document.getElementById('modalEditarTrabajador'));
    modal.show();
}

function recolectarEditValoresClase(nombreClase) {
    const elementos = document.querySelectorAll(`.${nombreClase}`);
    const valores = [];
    elementos.forEach(el => {
        if (el.value.trim() !== '') valores.push(el.value.trim());
    });
    return JSON.stringify(valores);
}

function recolectarEditPatologiasJSON() {
    const items = document.querySelectorAll('#editPatologiasContainer .dynamic-item-edit');
    const patologias = [];
    items.forEach(item => {
        const nombre = item.querySelector('.edit-patologia-nombre').value.trim();
        const tratamiento = item.querySelector('.edit-patologia-tratamiento').value.trim();
        if (nombre !== '') patologias.push({ nombre, tratamiento });
    });
    return JSON.stringify(patologias);
}

async function guardarEdicionTrabajador() {
    const cedula = document.getElementById('edit_cedula').value;
    const formData = new FormData();

    formData.append('first_name', document.getElementById('edit_first_name').value.trim());
    formData.append('last_name', document.getElementById('edit_last_name').value.trim());
    formData.append('birthdate', document.getElementById('edit_birthdate').value);
    formData.append('phone', document.getElementById('edit_phone').value.trim());
    formData.append('email', document.getElementById('edit_email').value.trim());
    formData.append('address', document.getElementById('edit_address').value.trim());
    formData.append('address_reference', document.getElementById('edit_address_reference').value.trim());

    formData.append('emergency_name', document.getElementById('edit_emergency_name').value.trim());
    formData.append('emergency_kinship', document.getElementById('edit_emergency_kinship').value.trim());
    formData.append('emergency_phone', document.getElementById('edit_emergency_phone').value.trim());

    formData.append('worker_code', document.getElementById('edit_worker_code').value.trim());
    formData.append('position', document.getElementById('edit_position').value.trim());
    formData.append('department', document.getElementById('edit_department').value.trim());
    formData.append('supervisor', document.getElementById('edit_supervisor').value.trim());
    formData.append('employment_type', document.getElementById('edit_employment_type').value);
    formData.append('hire_date', document.getElementById('edit_hire_date').value);
    formData.append('service_time', document.getElementById('edit_service_time').value);

    formData.append('education_level', document.getElementById('edit_education_level').value);
    formData.append('profession', document.getElementById('edit_profession').value.trim());
    formData.append('additional_degrees_json', recolectarEditValoresClase('edit-estudio-item'));
    formData.append('courses_json', recolectarEditValoresClase('edit-curso-item'));
    formData.append('certifications_json', recolectarEditValoresClase('edit-certificacion-item'));
    formData.append('awards_json', recolectarEditValoresClase('edit-reconocimiento-item'));

    formData.append('blood_type', document.getElementById('edit_blood_type').value);
    formData.append('uses_glasses', document.getElementById('edit_uses_glasses').value);
    formData.append('allergies_meds', document.getElementById('edit_allergies_meds').value.trim());
    formData.append('allergies_food', document.getElementById('edit_allergies_food').value.trim());
    formData.append('chronic_treatment', document.getElementById('edit_chronic_treatment').value.trim());
    formData.append('disability_condition', document.getElementById('edit_disability_condition').value.trim());
    formData.append('pathologies_json', recolectarEditPatologiasJSON());

    const photoFile = document.getElementById('edit_photo_file').files[0];
    if (photoFile) {
        formData.append('photo_file', photoFile);
    }

    try {
        const response = await fetch(`/api/workers/update/${cedula}`, {
            method: 'PUT',
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            const modalElement = document.getElementById('modalEditarTrabajador');
            const modal = bootstrap.Modal.getInstance(modalElement);
            modal.hide();
            buscarTrabajador();
            cargarDashboardGlobal();
        } else {
            alert(result.detail || 'Error al actualizar el registro.');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error de conexión local.');
    }
}

async function darDeAltaTrabajador() {
    if (!cedulaActualConsulta) return;

    if (!confirm('¿Desea dar de alta médica al trabajador y restaurar su estatus a ACTIVO?')) return;

    try {
        const response = await fetch(`/api/workers/discharge/${cedulaActualConsulta}`, {
            method: 'POST'
        });

        if (response.ok) {
            buscarTrabajador();
            cargarDashboardGlobal();
        } else {
            alert('Error al procesar la alta médica.');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error de conexión local.');
    }
}

function evaluarTipoEvento(tipo) {
    const reposoFields = document.getElementById('reposoFieldsContainer');
    if (tipo === 'Reposo Médico') {
        reposoFields.style.display = 'block';
    } else {
        reposoFields.style.display = 'none';
    }
}

async function guardarNuevoEvento() {
    if (!cedulaActualConsulta) return;

    const fecha = document.getElementById('event_date').value;
    const tipo = document.getElementById('event_type').value;
    const descripcion = document.getElementById('event_description').value.trim();
    const restDays = document.getElementById('rest_days').value;
    const isReposo = document.getElementById('is_active_reposo').checked && tipo === 'Reposo Médico';

    const nuevoEvento = {
        fecha: fecha,
        tipo: tipo,
        descripcion: descripcion,
        rest_days: restDays ? parseInt(restDays) : 0,
        is_reposo: isReposo
    };

    try {
        const response = await fetch(`/api/workers/add-event/${cedulaActualConsulta}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nuevoEvento)
        });

        if (response.ok) {
            const modalElement = document.getElementById('modalNuevoEvento');
            const modal = bootstrap.Modal.getInstance(modalElement);
            modal.hide();
            document.getElementById('formEvento').reset();
            document.getElementById('reposoFieldsContainer').style.display = 'none';
            buscarTrabajador();
            cargarDashboardGlobal();
        } else {
            alert('Error al guardar el evento.');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error de conexión local.');
    }
}

async function eliminarTrabajador() {
    if (!cedulaActualConsulta) return;

    if (!confirm(`¿Está totalmente seguro de eliminar todo el expediente del trabajador C.I. V-${cedulaActualConsulta}?`)) return;

    try {
        const response = await fetch(`/api/workers/delete/${cedulaActualConsulta}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            document.getElementById('workerProfileContainer').style.display = 'none';
            document.getElementById('cedulaInput').value = '';
            mostrarAlerta('El registro del trabajador ha sido eliminado completamente.', 'success');
            cargarDashboardGlobal();
        } else {
            alert('Error al eliminar el trabajador.');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error de comunicación local.', 'danger');
    }
}

function mostrarAlerta(mensaje, tipo) {
    const alertContainer = document.getElementById('alertContainer');
    alertContainer.className = `alert alert-${tipo} text-center card-profile mb-4`;
    alertContainer.innerHTML = mensaje;
    alertContainer.style.display = 'block';
}

function exportarPDF() {
    if (!cedulaActualConsulta) return;
    window.open(`/api/workers/export/pdf/${cedulaActualConsulta}`, '_blank');
}