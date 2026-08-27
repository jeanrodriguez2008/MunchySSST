let cedulaActualConsulta = '';
let datosTrabajadorActual = null;
let chartInstance = null;
let chartReporteSaludInstance = null;
let chartReporteSeguridadInstance = null;
let chartGeneroInstance = null;
let chartAreasInstance = null;

function normalizarCedula(cedula) {
    if (!cedula) return '';
    const numeros = cedula.toString().replace(/\D/g, '');
    return numeros ? `V${numeros}` : '';
}

function formatearNumeroPuntos(numero) {
    if (numero === null || numero === undefined || numero === '') return '0';
    const numLimpio = parseInt(numero.toString().replace(/\D/g, ''), 10);
    if (isNaN(numLimpio)) return numero;
    return numLimpio.toLocaleString('de-DE');
}

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

        if (document.getElementById('dashTotalTrabajadores')) document.getElementById('dashTotalTrabajadores').textContent = stats.total_trabajadores || 0;
        if (document.getElementById('dashActivos')) document.getElementById('dashActivos').textContent = stats.total_activos || 0;
        if (document.getElementById('dashReposo')) document.getElementById('dashReposo').textContent = stats.total_reposo || 0;

        if (document.getElementById('dashDiasEmpresa')) document.getElementById('dashDiasEmpresa').textContent = `${formatearNumeroPuntos(stats.dias_sin_accidentes_empresa || 0)} Días`;
        if (document.getElementById('dashLentes')) document.getElementById('dashLentes').textContent = stats.total_lentes || 0;
        if (document.getElementById('dashDiscapacidad')) document.getElementById('dashDiscapacidad').textContent = stats.total_discapacidad || 0;
        if (document.getElementById('dashCronicas')) document.getElementById('dashCronicas').textContent = stats.total_cronicas || 0;

        // Renderizado de gráficos interactivos
        renderizarGraficoGenero(stats.total_masculino || 0, stats.total_femenino || 0);
        renderizarGraficoAreas(stats.area_administrativos || 0, stats.area_operativos || 0, stats.area_ventas || 0);

        renderizarTablaGerencias(stats.gerencias_stats || []);
        renderizarGraficoTopCronicas(stats.top_cronicas || []);
    } catch (e) {
        console.error('Error al cargar dashboard:', e);
    }
}

function renderizarGraficoGenero(masculino, femenino) {
    const canvas = document.getElementById('chartGenero');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (chartGeneroInstance) chartGeneroInstance.destroy();

    chartGeneroInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Masculino (M)', 'Femenino (F)'],
            datasets: [{
                data: [masculino, femenino],
                backgroundColor: ['#0d6efd', '#dc3545'],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

function renderizarGraficoAreas(admin, operativo, ventas) {
    const canvas = document.getElementById('chartAreas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (chartAreasInstance) chartAreasInstance.destroy();

    chartAreasInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Administrativo', 'Operativo', 'Ventas'],
            datasets: [{
                label: 'Trabajadores',
                data: [admin, operativo, ventas],
                backgroundColor: ['#0dcaf0', '#198754', '#ffc107'],
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
}

function renderizarTablaGerencias(gerencias) {
    const tbody = document.getElementById('tableGerenciasBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!gerencias || gerencias.length === 0) {
        tbody.innerHTML = `<tr><td colspan="2" class="text-center text-muted">No hay gerencias registradas.</td></tr>`;
        return;
    }

    gerencias.forEach(g => {
        tbody.innerHTML += `
            <tr>
                <td class="fw-semibold"><i class="fa-solid fa-building me-2 text-danger"></i>${g.gerencia}</td>
                <td class="text-end fw-bold text-success"><span class="badge bg-success">${formatearNumeroPuntos(g.dias_sin_accidentes)} Días</span></td>
            </tr>
        `;
    });
}

function renderizarGraficoTopCronicas(topData) {
    const chartCanvas = document.getElementById('topCronicasChart');
    if (!chartCanvas) return;
    const ctx = chartCanvas.getContext('2d');
    
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

        let analisisText = `En el marco del **Servicio de Seguridad y Salud en el Trabajo**, la empresa registra una plantilla total de **${stats.total_trabajadores} trabajadores** (${stats.total_masculino} Masculinos y ${stats.total_femenino} Femeninos) distribuidos en: **${stats.area_administrativos} Administrativos**, **${stats.area_operativos} Operativos** y **${stats.area_ventas} Ventas**. Se mantiene un récord global óptimo de **${formatearNumeroPuntos(stats.dias_sin_accidentes_empresa)} días consecutivos sin accidentes laborales**. `;
        
        if (stats.total_reposo === 0) {
            analisisText += `Actualmente **no existen trabajadores en reposo médico**, contando con **${stats.total_activos} trabajadores totalmente activos**. `;
        } else {
            analisisText += `Actualmente se registra un ausentismo activo de **${stats.total_reposo} trabajador(es) en reposo médico** y **${stats.total_activos} activos**. `;
        }

        if (stats.total_cronicas > 0) {
            const patologiaPrincipal = stats.top_cronicas[0] ? stats.top_cronicas[0].nombre : 'Patologías no especificadas';
            analisisText += `En Salud Ocupacional, se identificaron **${stats.total_cronicas} caso(s) de condiciones crónicas**, teniendo mayor prevalencia la categoría de **${patologiaPrincipal}**. `;
        } else {
            analisisText += `No se registran diagnósticos de enfermedades crónicas activas en la plantilla. `;
        }

        analisisText += `Se registra un total de **${stats.total_lentes} trabajador(es)** con uso de corrección visual (lentes) y **${stats.total_discapacidad} caso(s)** con condición de discapacidad notificada.`;

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
    const btnRegistrarVacaciones = document.getElementById('btnRegistrarVacaciones');
    const btnAgregarRiesgo = document.getElementById('btnAgregarRiesgo');
    const btnExportPDF = document.getElementById('btnExportPDF');
    const searchSectionContainer = document.getElementById('searchSectionContainer');

    if (rolSesion === 'Webmaster') {
        if (searchSectionContainer) searchSectionContainer.style.display = 'block';
        if (btnEditar) btnEditar.style.display = 'block';
        if (btnEliminar) btnEliminar.style.display = 'block';
        if (btnDarDeAlta) btnDarDeAlta.style.display = 'block';
        if (btnNuevoEvento) btnNuevoEvento.style.display = 'block';
        if (btnExportExcel) btnExportExcel.style.display = 'inline-block';
        if (btnRegisterWorker) btnRegisterWorker.style.display = 'inline-block';
        if (btnRegistrarVacaciones) btnRegistrarVacaciones.style.display = 'block';
        if (btnAgregarRiesgo) btnAgregarRiesgo.style.display = 'block';
        if (btnExportPDF) btnExportPDF.style.display = 'block';
    } else if (rolSesion === 'Coordinador') {
        if (searchSectionContainer) searchSectionContainer.style.display = 'block';
        if (btnEditar) btnEditar.style.display = 'block';
        if (btnEliminar) btnEliminar.style.display = 'none';
        if (btnDarDeAlta) btnDarDeAlta.style.display = 'block';
        if (btnNuevoEvento) btnNuevoEvento.style.display = 'block';
        if (btnExportExcel) btnExportExcel.style.display = 'inline-block';
        if (btnRegisterWorker) btnRegisterWorker.style.display = 'inline-block';
        if (btnRegistrarVacaciones) btnRegistrarVacaciones.style.display = 'block';
        if (btnAgregarRiesgo) btnAgregarRiesgo.style.display = 'block';
        if (btnExportPDF) btnExportPDF.style.display = 'block';
    } else if (rolSesion === 'Analista') {
        if (searchSectionContainer) searchSectionContainer.style.display = 'block';
        if (btnEditar) btnEditar.style.display = 'none';
        if (btnEliminar) btnEliminar.style.display = 'none';
        if (btnDarDeAlta) btnDarDeAlta.style.display = 'none';
        if (btnNuevoEvento) btnNuevoEvento.style.display = 'block';
        if (btnExportExcel) btnExportExcel.style.display = 'none';
        if (btnRegisterWorker) btnRegisterWorker.style.display = 'none';
        if (btnRegistrarVacaciones) btnRegistrarVacaciones.style.display = 'none';
        if (btnAgregarRiesgo) btnAgregarRiesgo.style.display = 'none';
        if (btnExportPDF) btnExportPDF.style.display = 'block';
    } else if (rolSesion === 'Consultor') {
        if (searchSectionContainer) searchSectionContainer.style.display = 'none';
        if (btnEditar) btnEditar.style.display = 'none';
        if (btnEliminar) btnEliminar.style.display = 'none';
        if (btnDarDeAlta) btnDarDeAlta.style.display = 'none';
        if (btnNuevoEvento) btnNuevoEvento.style.display = 'none';
        if (btnExportExcel) btnExportExcel.style.display = 'none';
        if (btnRegisterWorker) btnRegisterWorker.style.display = 'none';
        if (btnRegistrarVacaciones) btnRegistrarVacaciones.style.display = 'none';
        if (btnAgregarRiesgo) btnAgregarRiesgo.style.display = 'none';
        if (btnExportPDF) btnExportPDF.style.display = 'none';
    }
}

async function buscarTrabajador() {
    const rawInput = document.getElementById('cedulaInput').value.trim();
    const cedula = normalizarCedula(rawInput);
    const alertContainer = document.getElementById('alertContainer');
    const profileContainer = document.getElementById('workerProfileContainer');

    if (!cedula) {
        Swal.fire({
            title: 'Cédula Requerida',
            text: 'Por favor ingrese un número de cédula válido (Ej. V123456789).',
            icon: 'warning',
            confirmButtonColor: '#d9251d'
        });
        return;
    }

    document.getElementById('cedulaInput').value = cedula;
    cedulaActualConsulta = cedula;
    profileContainer.style.display = 'none';
    mostrarAlerta('<i class="fa-solid fa-spinner fa-spin me-2"></i> Consultando base de datos...', 'info');

    try {
        const response = await fetch(`/api/workers/search/${cedula}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                mostrarAlerta(`No se encontró ningún trabajador registrado con la cédula <strong>${cedula}</strong>.`, 'danger');
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
    if (document.getElementById('workerGender')) document.getElementById('workerGender').textContent = data.gender || 'Masculino';
    document.getElementById('workerCodeBadge').textContent = data.worker_code || 'SIN CÓDIGO';
    document.getElementById('workerCedula').textContent = `C.I.: ${normalizarCedula(data.cedula)}`;
    document.getElementById('workerCargo').textContent = data.position || 'N/A';
    document.getElementById('workerDept').textContent = data.department || 'N/A';
    if (document.getElementById('workerArea')) document.getElementById('workerArea').textContent = data.area || 'N/A';
    document.getElementById('workerJefe').textContent = data.supervisor || 'N/A';
    document.getElementById('workerDaysWithoutRest').textContent = `${formatearNumeroPuntos(data.days_without_rest || 0)} Días`;

    const statusBadge = document.getElementById('workerStatusBadge');
    const reposoContainer = document.getElementById('reposoDetailsContainer');
    const vacacionesContainer = document.getElementById('vacacionesDetailsContainer');
    const estatusActual = data.calculated_status || (data.is_on_leave ? 'EN REPOSO' : 'ACTIVO');

    if (estatusActual === 'INACTIVO') {
        statusBadge.className = 'badge bg-dark badge-status';
        statusBadge.innerHTML = '<i class="fa-solid fa-user-xmark me-1"></i>INACTIVO / EGRESADO';
    } else if (estatusActual === 'EN REPOSO') {
        statusBadge.className = 'badge bg-danger badge-status';
        statusBadge.innerHTML = '<i class="fa-solid fa-bed-pulse me-1"></i>EN REPOSO';
    } else if (estatusActual === 'DE VACACIONES') {
        statusBadge.className = 'badge bg-warning text-dark badge-status';
        statusBadge.innerHTML = '<i class="fa-solid fa-umbrella-beach me-1"></i>DE VACACIONES';
    } else {
        statusBadge.className = 'badge bg-success badge-status';
        statusBadge.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i>ACTIVO';
    }

    if (data.is_on_leave) {
        document.getElementById('reposoDaysText').textContent = `EN REPOSO MÉDICO (${formatearNumeroPuntos(data.leave_days || 0)} DÍAS INACTIVO)`;
        document.getElementById('reposoCausaText').textContent = `Diagnóstico: ${data.leave_reason || 'No especificado'}`;
        reposoContainer.style.display = 'block';
    } else {
        reposoContainer.style.display = 'none';
    }

    if (estatusActual === 'DE VACACIONES' && data.vacations && data.vacations.length > 0) {
        const hoy = new Date();
        const vacActiva = data.vacations.find(v => {
            const inicio = new Date(v.fecha_inicio);
            const reintegro = new Date(v.fecha_reintegro);
            return inicio <= hoy && hoy < reintegro;
        }) || data.vacations[data.vacations.length - 1];

        if (vacActiva) {
            const dtInicio = new Date(vacActiva.fecha_inicio);
            const diasTranscurridos = Math.max(Math.floor((hoy - dtInicio) / (1000 * 60 * 60 * 24)) + 1, 1);
            document.getElementById('vacacionesText').textContent = `DE VACACIONES (${diasTranscurridos} Días Inactivo de ${vacActiva.dias_vacaciones || 'N/A'} Asignados)`;
            document.getElementById('vacacionesReintegroText').textContent = `Fecha de Reintegro Programada: ${formatearFecha(vacActiva.fecha_reintegro)}`;
            vacacionesContainer.style.display = 'block';
        } else {
            vacacionesContainer.style.display = 'none';
        }
    } else {
        if (vacacionesContainer) vacacionesContainer.style.display = 'none';
    }

    document.getElementById('workerBirthdate').textContent = formatearFecha(data.birthdate);
    document.getElementById('workerPhone').textContent = data.phone || 'N/A';
    document.getElementById('workerEmail').textContent = data.email || 'N/A';
    document.getElementById('workerAddress').textContent = data.address || 'N/A';
    document.getElementById('workerReference').textContent = data.address_reference || 'N/A';

    if (document.getElementById('workerShirtSize')) document.getElementById('workerShirtSize').textContent = data.shirt_size || 'N/A';
    if (document.getElementById('workerPantsSize')) document.getElementById('workerPantsSize').textContent = data.pants_size || 'N/A';
    if (document.getElementById('workerShoeSize')) document.getElementById('workerShoeSize').textContent = data.shoe_size || 'N/A';
    if (document.getElementById('workerOverallSize')) document.getElementById('workerOverallSize').textContent = data.overall_size || 'N/A';

    if (data.emergency_contact) {
        document.getElementById('emergencyName').textContent = data.emergency_contact.name || 'N/A';
        document.getElementById('emergencyKinship').textContent = data.emergency_contact.kinship || 'N/A';
        document.getElementById('emergencyPhone').textContent = data.emergency_contact.phone || 'N/A';
    }

    document.getElementById('workerCode').textContent = data.worker_code || 'N/A';
    document.getElementById('workerHireDate').textContent = formatearFecha(data.hire_date);
    if (document.getElementById('workerExitDate')) document.getElementById('workerExitDate').textContent = formatearFecha(data.exit_date);
    document.getElementById('workerServiceTime').textContent = data.service_time || 'N/A';
    document.getElementById('workerCondition').textContent = data.employment_type || 'N/A';
    if (document.getElementById('workerConditionBadge')) document.getElementById('workerConditionBadge').textContent = (data.employment_type || 'FIJO').toUpperCase();

    if (document.getElementById('workerLastDotationDate')) document.getElementById('workerLastDotationDate').textContent = formatearFecha(data.last_dotation_date);
    if (document.getElementById('workerDotationStatus')) document.getElementById('workerDotationStatus').textContent = data.dotation_status || 'Completa';
    if (document.getElementById('workerDotationComments')) document.getElementById('workerDotationComments').textContent = data.dotation_comments || 'Ninguno';

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

    // RENDERIZADO DE EXÁMENES MÉDICOS PREVENTIVOS Y ALERTAS
    const containerExamenAlerts = document.getElementById('examAlertsContainer');
    if (containerExamenAlerts) {
        if (data.pending_exams && data.pending_exams.length > 0) {
            containerExamenAlerts.style.display = 'block';
            containerExamenAlerts.innerHTML = data.pending_exams.map(e => `
                <div class="alert alert-warning p-2 mb-2 d-flex align-items-center">
                    <i class="fa-solid fa-triangle-exclamation text-danger fs-5 me-2"></i>
                    <small class="fw-bold text-dark">${e.mensaje}</small>
                </div>
            `).join('');
        } else {
            containerExamenAlerts.style.display = 'none';
            containerExamenAlerts.innerHTML = '';
        }
    }

    const tbodyExams = document.getElementById('examsTableBody');
    if (tbodyExams) {
        if (data.medical_exams && data.medical_exams.length > 0) {
            tbodyExams.innerHTML = data.medical_exams.map(e => `
                <tr>
                    <td>${formatearFecha(e.fecha)}</td>
                    <td><span class="badge bg-secondary">${e.tipo_examen}</span></td>
                    <td><span class="badge bg-success">${e.resultado || 'Apto'}</span></td>
                    <td>${e.observaciones || '-'}</td>
                </tr>
            `).join('');
        } else {
            tbodyExams.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Sin exámenes médicos preventivos registrados.</td></tr>';
        }
    }

    const eventsTableBody = document.getElementById('eventsTableBody');
    eventsTableBody.innerHTML = '';
    if (data.medical_events && data.medical_events.length > 0) {
        data.medical_events.forEach(ev => {
            eventsTableBody.innerHTML += `
                <tr>
                    <td>${formatearFecha(ev.fecha)}</td>
                    <td><span class="badge ${ev.tipo === 'Reposo Médico' ? 'bg-warning text-dark' : 'bg-danger'}">${ev.tipo || 'Evento'}</span></td>
                    <td>${ev.rest_days ? formatearNumeroPuntos(ev.rest_days) + ' Días' : 'N/A'}</td>
                    <td>${ev.descripcion}</td>
                    <td><span class="badge ${ev.is_reposo ? 'bg-warning text-dark' : 'bg-success'}">${ev.is_reposo ? 'En Reposo' : 'Activo'}</span></td>
                </tr>
            `;
        });
    } else {
        eventsTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Sin eventos registrados.</td></tr>`;
    }

    const vacationsTableBody = document.getElementById('vacationsTableBody');
    if (vacationsTableBody) {
        vacationsTableBody.innerHTML = '';
        if (data.vacations && data.vacations.length > 0) {
            data.vacations.forEach(v => {
                vacationsTableBody.innerHTML += `
                    <tr>
                        <td class="fw-semibold text-primary">${formatearFecha(v.fecha_inicio)}</td>
                        <td class="fw-semibold text-success">${formatearFecha(v.fecha_reintegro)}</td>
                        <td><span class="badge bg-info text-dark">${v.dias_vacaciones || '0'} Días</span></td>
                        <td>${v.observacion || 'Sin observaciones'}</td>
                    </tr>
                `;
            });
        } else {
            vacationsTableBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Sin períodos vacacionales registrados.</td></tr>';
        }
    }

    const risksTableBody = document.getElementById('risksTableBody');
    if (risksTableBody) {
        risksTableBody.innerHTML = '';
        if (data.risk_notifications && data.risk_notifications.length > 0) {
            data.risk_notifications.forEach(r => {
                risksTableBody.innerHTML += `
                    <tr>
                        <td class="fw-semibold">${formatearFecha(r.fecha)}</td>
                        <td class="fw-bold text-secondary">${r.puesto || 'Puesto Evaluado'}</td>
                        <td class="text-danger fw-semibold">${r.descripcion_riesgo}</td>
                    </tr>
                `;
            });
        } else {
            risksTableBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Sin notificaciones de riesgo registradas.</td></tr>';
        }
    }
}

function renderizarLista(elementId, arrayDatos) {
    const contenedor = document.getElementById(elementId);
    if (!contenedor) return;
    contenedor.innerHTML = '';
    if (arrayDatos && arrayDatos.length > 0) {
        arrayDatos.forEach(item => {
            contenedor.innerHTML += `<li class="list-group-item"><i class="fa-solid fa-check text-success me-2"></i>${item}</li>`;
        });
    } else {
        contenedor.innerHTML = `<li class="list-group-item text-muted">Sin registros agregados.</li>`;
    }
}

function calcularDiasYReintegroVacaciones() {
    const inputInicio = document.getElementById('vac_start_date').value;
    const inputReintegro = document.getElementById('vac_return_date').value;
    const campoDias = document.getElementById('vac_days_count');

    if (inputInicio && inputReintegro) {
        const dtInicio = new Date(inputInicio);
        const dtReintegro = new Date(inputReintegro);

        if (dtReintegro <= dtInicio) {
            campoDias.value = "La fecha de reintegro debe ser posterior al inicio.";
            return;
        }

        const diffTime = dtReintegro - dtInicio;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        campoDias.value = `${diffDays} Días de disfrute`;
    } else {
        campoDias.value = '';
    }
}

async function guardarNuevaVacacion() {
    if (!cedulaActualConsulta) return;

    const fechaInicio = document.getElementById('vac_start_date').value;
    const fechaReintegro = document.getElementById('vac_return_date').value;
    const obs = document.getElementById('vac_obs').value.trim();

    if (!fechaInicio || !fechaReintegro) {
        Swal.fire({
            title: 'Campos Incompletos',
            text: 'Por favor complete las fechas de inicio y reintegro.',
            icon: 'warning',
            confirmButtonColor: '#d9251d'
        });
        return;
    }

    const dtInicio = new Date(fechaInicio);
    const dtReintegro = new Date(fechaReintegro);
    const diasCalculados = Math.ceil((dtReintegro - dtInicio) / (1000 * 60 * 60 * 24));

    const vacationData = {
        fecha_inicio: fechaInicio,
        fecha_reintegro: fechaReintegro,
        dias_vacaciones: diasCalculados > 0 ? diasCalculados : 0,
        observacion: obs
    };

    try {
        const response = await fetch(`/api/workers/add-vacation/${cedulaActualConsulta}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(vacationData)
        });

        if (response.ok) {
            const modalElement = document.getElementById('modalNuevaVacacion');
            const modal = bootstrap.Modal.getInstance(modalElement);
            modal.hide();
            document.getElementById('formVacacion').reset();
            
            Swal.fire({
                title: 'Vacaciones Asignadas',
                text: 'El período vacacional fue registrado con éxito.',
                icon: 'success',
                confirmButtonColor: '#d9251d'
            });

            buscarTrabajador();
            cargarDashboardGlobal();
        } else {
            Swal.fire({
                title: 'Error',
                text: 'No se pudo guardar la vacación.',
                icon: 'error',
                confirmButtonColor: '#d9251d'
            });
        }
    } catch (e) {
        console.error('Error:', e);
        Swal.fire({
            title: 'Error de Red',
            text: 'Fallo de conexión con el servidor.',
            icon: 'error',
            confirmButtonColor: '#d9251d'
        });
    }
}

async function guardarNotificacionRiesgo() {
    if (!cedulaActualConsulta) return;

    const riskData = {
        fecha: document.getElementById('risk_date').value,
        puesto: document.getElementById('risk_position').value.trim(),
        descripcion_riesgo: document.getElementById('risk_description').value.trim()
    };

    try {
        const response = await fetch(`/api/workers/add-risk/${cedulaActualConsulta}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(riskData)
        });

        if (response.ok) {
            const modalElement = document.getElementById('modalNotificacionRiesgo');
            const modal = bootstrap.Modal.getInstance(modalElement);
            modal.hide();
            document.getElementById('formNotificacionRiesgo').reset();

            Swal.fire({
                title: 'Notificación Registrada',
                text: 'Los riesgos fueron asociados al expediente.',
                icon: 'success',
                confirmButtonColor: '#d9251d'
            });

            buscarTrabajador();
        } else {
            Swal.fire({
                title: 'Error',
                text: 'No se pudo registrar la notificación de riesgo.',
                icon: 'error',
                confirmButtonColor: '#d9251d'
            });
        }
    } catch (e) {
        console.error('Error:', e);
        Swal.fire({
            title: 'Error de Conexión',
            text: 'Inconveniente de comunicación local.',
            icon: 'error',
            confirmButtonColor: '#d9251d'
        });
    }
}

function calcularTiempoServicioEdicion() {
    const inputFechaIngreso = document.getElementById('edit_hire_date').value;
    const inputFechaEgreso = document.getElementById('edit_exit_date') ? document.getElementById('edit_exit_date').value : '';
    const outputCampo = document.getElementById('edit_service_time');

    if (!inputFechaIngreso) {
        outputCampo.value = '';
        return;
    }

    const fechaIngreso = new Date(inputFechaIngreso);
    const fechaFin = inputFechaEgreso ? new Date(inputFechaEgreso) : new Date();

    let años = fechaFin.getFullYear() - fechaIngreso.getFullYear();
    let meses = fechaFin.getMonth() - fechaIngreso.getMonth();
    let dias = fechaFin.getDate() - fechaIngreso.getDate();

    if (dias < 0) {
        meses--;
        const ultimoDiaMesAnterior = new Date(fechaFin.getFullYear(), fechaFin.getMonth(), 0).getDate();
        dias += ultimoDiaMesAnterior;
    }

    if (meses < 0) {
        años--;
        meses += 12;
    }

    let estadoTexto = inputFechaEgreso ? ' (INACTIVO / EGRESADO)' : '';
    outputCampo.value = `${años} Años, ${meses} Meses y ${dias} Días${estadoTexto}`;
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

function agregarCampoEditRiesgo(fecha = '', descripcion = '', puesto = '') {
    const container = document.getElementById('editRiesgosContainer');
    const div = document.createElement('div');
    div.className = 'dynamic-item-edit item-riesgo-edit';
    div.innerHTML = `
        <div class="row g-2 align-items-center">
            <div class="col-md-3">
                <input type="date" class="form-control edit-riesgo-fecha" value="${fecha}">
            </div>
            <div class="col-md-8">
                <input type="text" class="form-control edit-riesgo-desc" value="${descripcion}" placeholder="Nombre / Descripción de la Notificación de Riesgo">
                <input type="hidden" class="edit-riesgo-puesto" value="${puesto}">
            </div>
            <div class="col-md-1 text-end">
                <button type="button" class="btn btn-outline-danger btn-sm w-100" onclick="this.closest('.dynamic-item-edit').remove()"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `;
    container.appendChild(div);
}

function abrirModalEditar() {
    if (!datosTrabajadorActual) return;

    document.getElementById('edit_cedula').value = normalizarCedula(datosTrabajadorActual.cedula);
    document.getElementById('edit_first_name').value = datosTrabajadorActual.first_name;
    document.getElementById('edit_last_name').value = datosTrabajadorActual.last_name;
    if (document.getElementById('edit_gender')) document.getElementById('edit_gender').value = datosTrabajadorActual.gender || 'Masculino';
    document.getElementById('edit_birthdate').value = datosTrabajadorActual.birthdate || '';
    document.getElementById('edit_phone').value = datosTrabajadorActual.phone || '';
    document.getElementById('edit_email').value = datosTrabajadorActual.email || '';
    document.getElementById('edit_address').value = datosTrabajadorActual.address || '';
    document.getElementById('edit_address_reference').value = datosTrabajadorActual.address_reference || '';

    if (document.getElementById('edit_shirt_size')) document.getElementById('edit_shirt_size').value = datosTrabajadorActual.shirt_size || '';
    if (document.getElementById('edit_pants_size')) document.getElementById('edit_pants_size').value = datosTrabajadorActual.pants_size || '';
    if (document.getElementById('edit_shoe_size')) document.getElementById('edit_shoe_size').value = datosTrabajadorActual.shoe_size || '';
    if (document.getElementById('edit_overall_size')) document.getElementById('edit_overall_size').value = datosTrabajadorActual.overall_size || '';

    if (datosTrabajadorActual.emergency_contact) {
        document.getElementById('edit_emergency_name').value = datosTrabajadorActual.emergency_contact.name || '';
        document.getElementById('edit_emergency_kinship').value = datosTrabajadorActual.emergency_contact.kinship || '';
        document.getElementById('edit_emergency_phone').value = datosTrabajadorActual.emergency_contact.phone || '';
    }

    document.getElementById('edit_worker_code').value = datosTrabajadorActual.worker_code;
    document.getElementById('edit_position').value = datosTrabajadorActual.position;
    document.getElementById('edit_department').value = datosTrabajadorActual.department;
    if (document.getElementById('edit_area')) document.getElementById('edit_area').value = datosTrabajadorActual.area || 'Operativo';
    document.getElementById('edit_supervisor').value = datosTrabajadorActual.supervisor || '';
    document.getElementById('edit_employment_type').value = datosTrabajadorActual.employment_type;
    document.getElementById('edit_hire_date').value = datosTrabajadorActual.hire_date || '';
    if (document.getElementById('edit_exit_date')) document.getElementById('edit_exit_date').value = datosTrabajadorActual.exit_date || '';
    document.getElementById('edit_service_time').value = datosTrabajadorActual.service_time || '';

    if (document.getElementById('edit_last_dotation_date')) document.getElementById('edit_last_dotation_date').value = datosTrabajadorActual.last_dotation_date || '';
    if (document.getElementById('edit_dotation_status')) document.getElementById('edit_dotation_status').value = datosTrabajadorActual.dotation_status || 'Completa';
    if (document.getElementById('edit_dotation_comments')) document.getElementById('edit_dotation_comments').value = datosTrabajadorActual.dotation_comments || '';

    const containerRiesgos = document.getElementById('editRiesgosContainer');
    if (containerRiesgos) {
        containerRiesgos.innerHTML = '';
        if (datosTrabajadorActual.risk_notifications && datosTrabajadorActual.risk_notifications.length > 0) {
            datosTrabajadorActual.risk_notifications.forEach(r => agregarCampoEditRiesgo(r.fecha, r.descripcion_riesgo, r.puesto));
        }
    }

    document.getElementById('edit_education_level').value = datosTrabajadorActual.education_level;
    document.getElementById('edit_profession').value = datosTrabajadorActual.profession || '';

    const containerEstudios = document.getElementById('editEstudiosContainer');
    if (containerEstudios) {
        containerEstudios.innerHTML = '';
        if (datosTrabajadorActual.additional_degrees && datosTrabajadorActual.additional_degrees.length > 0) {
            datosTrabajadorActual.additional_degrees.forEach(val => agregarCampoEditEstudio(val));
        }
    }

    const containerCursos = document.getElementById('editCursosContainer');
    if (containerCursos) {
        containerCursos.innerHTML = '';
        if (datosTrabajadorActual.courses && datosTrabajadorActual.courses.length > 0) {
            datosTrabajadorActual.courses.forEach(val => agregarCampoEditCurso(val));
        }
    }

    const containerCertificaciones = document.getElementById('editCertificacionesContainer');
    if (containerCertificaciones) {
        containerCertificaciones.innerHTML = '';
        if (datosTrabajadorActual.certifications && datosTrabajadorActual.certifications.length > 0) {
            datosTrabajadorActual.certifications.forEach(val => agregarCampoEditCertificacion(val));
        }
    }

    const containerReconocimientos = document.getElementById('editReconocimientosContainer');
    if (containerReconocimientos) {
        containerReconocimientos.innerHTML = '';
        if (datosTrabajadorActual.awards && datosTrabajadorActual.awards.length > 0) {
            datosTrabajadorActual.awards.forEach(val => agregarCampoEditReconocimiento(val));
        }
    }

    document.getElementById('edit_blood_type').value = datosTrabajadorActual.blood_type;
    document.getElementById('edit_uses_glasses').value = datosTrabajadorActual.uses_glasses || 'No';
    document.getElementById('edit_allergies_meds').value = datosTrabajadorActual.allergies_meds || '';
    document.getElementById('edit_allergies_food').value = datosTrabajadorActual.allergies_food || '';
    document.getElementById('edit_chronic_treatment').value = datosTrabajadorActual.chronic_treatment || '';
    document.getElementById('edit_disability_condition').value = datosTrabajadorActual.disability_condition || '';

    const containerPatologias = document.getElementById('editPatologiasContainer');
    if (containerPatologias) {
        containerPatologias.innerHTML = '';
        if (datosTrabajadorActual.pathologies && datosTrabajadorActual.pathologies.length > 0) {
            datosTrabajadorActual.pathologies.forEach(p => agregarCampoEditPatologia(p.nombre, p.tratamiento));
        }
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

function recolectarEditRiesgosJSON() {
    const items = document.querySelectorAll('#editRiesgosContainer .item-riesgo-edit');
    const riesgos = [];
    items.forEach(item => {
        const fecha = item.querySelector('.edit-riesgo-fecha').value;
        const descripcion = item.querySelector('.edit-riesgo-desc').value.trim();
        const puesto = item.querySelector('.edit-riesgo-puesto') ? item.querySelector('.edit-riesgo-puesto').value : '';
        if (fecha !== '' && descripcion !== '') {
            riesgos.push({ fecha, descripcion_riesgo: descripcion, puesto: puesto || document.getElementById('edit_position').value });
        }
    });
    return JSON.stringify(riesgos);
}

async function guardarEdicionTrabajador() {
    const cedula = document.getElementById('edit_cedula').value;
    const formData = new FormData();

    formData.append('first_name', document.getElementById('edit_first_name').value.trim());
    formData.append('last_name', document.getElementById('edit_last_name').value.trim());
    if (document.getElementById('edit_gender')) formData.append('gender', document.getElementById('edit_gender').value);
    formData.append('birthdate', document.getElementById('edit_birthdate').value);
    formData.append('phone', document.getElementById('edit_phone').value.trim());
    formData.append('email', document.getElementById('edit_email').value.trim());
    formData.append('address', document.getElementById('edit_address').value.trim());
    formData.append('address_reference', document.getElementById('edit_address_reference').value.trim());

    if (document.getElementById('edit_shirt_size')) formData.append('shirt_size', document.getElementById('edit_shirt_size').value.trim());
    if (document.getElementById('edit_pants_size')) formData.append('pants_size', document.getElementById('edit_pants_size').value.trim());
    if (document.getElementById('edit_shoe_size')) formData.append('shoe_size', document.getElementById('edit_shoe_size').value.trim());
    if (document.getElementById('edit_overall_size')) formData.append('overall_size', document.getElementById('edit_overall_size').value.trim());

    formData.append('emergency_name', document.getElementById('edit_emergency_name').value.trim());
    formData.append('emergency_kinship', document.getElementById('edit_emergency_kinship').value.trim());
    formData.append('emergency_phone', document.getElementById('edit_emergency_phone').value.trim());

    formData.append('worker_code', document.getElementById('edit_worker_code').value.trim());
    formData.append('position', document.getElementById('edit_position').value.trim());
    formData.append('department', document.getElementById('edit_department').value.trim());
    if (document.getElementById('edit_area')) formData.append('area', document.getElementById('edit_area').value);
    formData.append('supervisor', document.getElementById('edit_supervisor').value.trim());
    formData.append('employment_type', document.getElementById('edit_employment_type').value);
    formData.append('hire_date', document.getElementById('edit_hire_date').value);
    if (document.getElementById('edit_exit_date')) formData.append('exit_date', document.getElementById('edit_exit_date').value);
    formData.append('service_time', document.getElementById('edit_service_time').value);

    if (document.getElementById('edit_last_dotation_date')) formData.append('last_dotation_date', document.getElementById('edit_last_dotation_date').value);
    if (document.getElementById('edit_dotation_status')) formData.append('dotation_status', document.getElementById('edit_dotation_status').value);
    if (document.getElementById('edit_dotation_comments')) formData.append('dotation_comments', document.getElementById('edit_dotation_comments').value.trim());

    formData.append('risk_notifications_json', recolectarEditRiesgosJSON());

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

            Swal.fire({
                title: 'Actualización Exitosa',
                text: 'Los datos del expediente han sido modificados.',
                icon: 'success',
                confirmButtonColor: '#d9251d'
            });

            buscarTrabajador();
            cargarDashboardGlobal();
        } else {
            Swal.fire({
                title: 'Error de Actualización',
                text: result.detail || 'Ocurrió un error al actualizar el registro.',
                icon: 'error',
                confirmButtonColor: '#d9251d'
            });
        }
    } catch (error) {
        console.error('Error:', error);
        Swal.fire({
            title: 'Error de Red',
            text: 'Conexión local interrumpida.',
            icon: 'error',
            confirmButtonColor: '#d9251d'
        });
    }
}

async function darDeAltaTrabajador() {
    if (!cedulaActualConsulta) return;

    Swal.fire({
        title: 'Alta Médica',
        text: '¿Confirma dar de alta al trabajador y reincorporarlo al estatus ACTIVO?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#198754',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, dar de alta',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const response = await fetch(`/api/workers/discharge/${cedulaActualConsulta}`, {
                    method: 'POST'
                });

                if (response.ok) {
                    Swal.fire({
                        title: 'Alta Confirmada',
                        text: 'El trabajador retornó al estatus ACTIVO.',
                        icon: 'success',
                        confirmButtonColor: '#198754'
                    });
                    buscarTrabajador();
                    cargarDashboardGlobal();
                } else {
                    Swal.fire({
                        title: 'Error',
                        text: 'No se pudo procesar la alta médica.',
                        icon: 'error',
                        confirmButtonColor: '#d9251d'
                    });
                }
            } catch (error) {
                console.error('Error:', error);
                Swal.fire({
                    title: 'Error de Red',
                    text: 'Inconveniente local.',
                    icon: 'error',
                    confirmButtonColor: '#d9251d'
                });
            }
        }
    });
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

            Swal.fire({
                title: 'Evento Registrado',
                text: 'El historial del trabajador fue actualizado.',
                icon: 'success',
                confirmButtonColor: '#d9251d'
            });

            buscarTrabajador();
            cargarDashboardGlobal();
        } else {
            Swal.fire({
                title: 'Error',
                text: 'No se pudo registrar el evento.',
                icon: 'error',
                confirmButtonColor: '#d9251d'
            });
        }
    } catch (error) {
        console.error('Error:', error);
        Swal.fire({
            title: 'Error de Conexión',
            text: 'Fallo al intentar registrar el evento.',
            icon: 'error',
            confirmButtonColor: '#d9251d'
        });
    }
}

async function eliminarTrabajador() {
    if (!cedulaActualConsulta) return;

    Swal.fire({
        title: '¿Eliminar Expediente?',
        text: `Esta acción eliminará de forma permanente el expediente del trabajador C.I. ${cedulaActualConsulta}.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d9251d',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, eliminar expediente',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const response = await fetch(`/api/workers/delete/${cedulaActualConsulta}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    document.getElementById('workerProfileContainer').style.display = 'none';
                    document.getElementById('cedulaInput').value = '';

                    Swal.fire({
                        title: 'Expediente Eliminado',
                        text: 'El registro se eliminó del sistema.',
                        icon: 'success',
                        confirmButtonColor: '#d9251d'
                    });

                    cargarDashboardGlobal();
                } else {
                    Swal.fire({
                        title: 'Error',
                        text: 'No se pudo eliminar el trabajador.',
                        icon: 'error',
                        confirmButtonColor: '#d9251d'
                    });
                }
            } catch (error) {
                console.error('Error:', error);
                Swal.fire({
                    title: 'Error de Red',
                    text: 'Error de comunicación local.',
                    icon: 'error',
                    confirmButtonColor: '#d9251d'
                });
            }
        }
    });
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