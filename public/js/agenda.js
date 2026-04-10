(function () {
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const container = document.getElementById('agenda-container');
  const fechaEl = document.getElementById('fecha-hoy');

  const hoy = new Date();
  const fechaStr = hoy.toISOString().split('T')[0];
  const horaStr = hoy.toTimeString().slice(0, 5);
  const diaSemana = DIAS[hoy.getDay()];
  const fechaFormateada = diaSemana + ' ' + hoy.getDate() + ' de ' + MESES[hoy.getMonth()] + ' de ' + hoy.getFullYear();

  fechaEl.textContent = fechaFormateada;

  init();

  function init() {
    var cached = localStorage.getItem('checklist_' + fechaStr);
    if (cached) {
      try {
        var data = JSON.parse(cached);
        renderChecklist(data.resumen, data.checklist);
      } catch (e) {
        showGenerateButton();
      }
    } else {
      showGenerateButton();
    }
  }

  function showGenerateButton() {
    container.innerHTML =
      '<div class="generate-section">' +
        '<p>No tenés agenda generada para hoy.</p>' +
        '<button class="btn-generate" id="btn-generar">' +
          '&#9654; Generar Agenda de Hoy' +
        '</button>' +
      '</div>';

    document.getElementById('btn-generar').addEventListener('click', generarAgenda);
  }

  function showSpinner() {
    container.innerHTML =
      '<div class="spinner-overlay">' +
        '<div class="spinner"></div>' +
        '<div class="spinner-text">Analizando leads y generando tu agenda...</div>' +
      '</div>';
  }

  function generarAgenda() {
    showSpinner();

    fetch('/api/agenda/generar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha: fechaStr, hora_actual: horaStr })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.ok) {
          var errorMsg = data.error || 'Error desconocido al generar la agenda';
          showNotification(errorMsg, true);
          console.error('Error del servidor:', errorMsg);
          showGenerateButton();
          return;
        }

        localStorage.setItem('checklist_' + fechaStr, JSON.stringify({
          resumen: data.resumen,
          checklist: data.checklist_completo
        }));

        renderChecklist(data.resumen, data.checklist_completo);
      })
      .catch(function (err) {
        console.error('Error de red:', err);
        showNotification('Error de conexión: ' + (err.message || 'sin detalle'), true);
        showGenerateButton();
      });
  }

  function renderChecklist(resumen, checklist) {
    if (!checklist || checklist.length === 0) {
      container.innerHTML =
        '<div class="empty-state">' +
          '<p>No hay gestiones programadas para hoy.</p>' +
        '</div>';
      return;
    }

    var completadas = checklist.filter(function (i) { return i.completado; }).length;
    var total = checklist.length;
    var porcentaje = total > 0 ? Math.round((completadas / total) * 100) : 0;

    var pendientesAyer = checklist.filter(function (i) { return i.era_pendiente_de; });
    var gestionesHoy = checklist.filter(function (i) { return !i.era_pendiente_de; });

    var html = '';

    if (resumen) {
      html += '<div class="resumen-box">' + escapeHtml(resumen) + '</div>';
    }

    html +=
      '<div class="progress-container">' +
        '<div class="progress-text">' + completadas + ' de ' + total + ' gestiones completadas</div>' +
        '<div class="progress-bar"><div class="progress-fill" style="width: ' + porcentaje + '%"></div></div>' +
      '</div>';

    if (pendientesAyer.length > 0) {
      html += '<div class="checklist-section-title">Pendientes de ayer</div>';
      for (var i = 0; i < pendientesAyer.length; i++) {
        html += renderItem(pendientesAyer[i], true);
      }
    }

    if (gestionesHoy.length > 0) {
      html += '<div class="checklist-section-title">Agenda de hoy</div>';
      for (var j = 0; j < gestionesHoy.length; j++) {
        html += renderItem(gestionesHoy[j], false);
      }
    }

    container.innerHTML = html;

    container.querySelectorAll('.checklist-checkbox').forEach(function (cb) {
      cb.addEventListener('click', function () {
        toggleItem(this);
      });
    });
  }

  function renderItem(item, esPendiente) {
    var completadoClass = item.completado ? ' completado' : '';
    var checkedClass = item.completado ? ' checked' : '';
    var tempClass = 'badge-' + (item.temperatura || 'fria');

    var atrasoHtml = '';
    if (esPendiente && item.era_pendiente_de) {
      var dias = calcularDiasDesde(item.era_pendiente_de);
      var atrasoTexto = dias > 0 ? ('Atrasado ' + dias + (dias === 1 ? ' día' : ' días')) : 'Atrasado';
      atrasoHtml =
        '<span class="pendiente-badge">PENDIENTE</span>' +
        '<span class="pendiente-atraso">' + atrasoTexto + '</span>';
    }

    return (
      '<div class="checklist-item' + completadoClass + '" data-id="' + item.id + '">' +
        '<div class="checklist-checkbox' + checkedClass + '" data-check-id="' + item.id + '" data-completado="' + (item.completado ? '1' : '0') + '"></div>' +
        '<div class="checklist-body checklist-content">' +
          '<div class="checklist-hora">' + escapeHtml(item.hora_sugerida || '') + '</div>' +
          '<div class="checklist-lead-name">' + escapeHtml(item.nombre_lead || '') + ' <span class="badge ' + tempClass + '">' + escapeHtml(item.temperatura || '') + '</span></div>' +
          '<div class="checklist-modelo">' + escapeHtml(item.modelo || '') + '</div>' +
          '<div class="checklist-accion">' + escapeHtml(item.accion || '') + '</div>' +
        '</div>' +
        '<div class="checklist-actions">' +
          atrasoHtml +
          (item.lead_id ? '<a href="/lead.html?id=' + item.lead_id + '&from=agenda" class="btn-gestionar">Gestionar &#8594;</a>' : '') +
        '</div>' +
      '</div>'
    );
  }

  function toggleItem(checkbox) {
    var checkId = checkbox.getAttribute('data-check-id');
    var currentState = checkbox.getAttribute('data-completado') === '1';
    var newState = !currentState;

    checkbox.classList.toggle('checked');
    checkbox.setAttribute('data-completado', newState ? '1' : '0');

    var itemEl = checkbox.closest('.checklist-item');
    if (newState) {
      itemEl.classList.add('completado');
    } else {
      itemEl.classList.remove('completado');
    }

    fetch('/api/checklist/' + fechaStr + '/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ check_id: checkId, completado: newState })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.ok) {
          showNotification('Error al actualizar', true);
          return;
        }
        updateLocalCache(checkId, newState);
        updateProgress();
      })
      .catch(function () {
        showNotification('Error de conexión', true);
      });
  }

  function updateLocalCache(checkId, completado) {
    var cached = localStorage.getItem('checklist_' + fechaStr);
    if (!cached) return;
    try {
      var data = JSON.parse(cached);
      var checklist = data.checklist;
      for (var i = 0; i < checklist.length; i++) {
        if (checklist[i].id === checkId) {
          checklist[i].completado = completado;
          checklist[i].timestamp_completado = completado ? new Date().toISOString() : null;
          break;
        }
      }
      localStorage.setItem('checklist_' + fechaStr, JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }

  function updateProgress() {
    var items = container.querySelectorAll('.checklist-item');
    var total = items.length;
    var completadas = container.querySelectorAll('.checklist-item.completado').length;
    var porcentaje = total > 0 ? Math.round((completadas / total) * 100) : 0;

    var progressText = container.querySelector('.progress-text');
    var progressFill = container.querySelector('.progress-fill');
    if (progressText) progressText.textContent = completadas + ' de ' + total + ' gestiones completadas';
    if (progressFill) progressFill.style.width = porcentaje + '%';
  }

  function calcularDiasDesde(fecha) {
    var d = new Date(fecha + 'T12:00:00');
    var diff = new Date() - d;
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  }

  function showNotification(msg, isError) {
    var el = document.createElement('div');
    el.className = 'notification' + (isError ? ' error' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }
})();
