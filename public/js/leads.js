(function () {
  var allLeads = [];
  var currentFilter = 'todos';
  var currentSort = 'score';

  var listEl = document.getElementById('leads-list');
  var searchInput = document.getElementById('search-input');
  var sortSelect = document.getElementById('sort-select');
  var filtersEl = document.getElementById('filters');

  init();

  function init() {
    loadLeads();

    searchInput.addEventListener('input', renderFiltered);

    sortSelect.addEventListener('change', function () {
      currentSort = this.value;
      renderFiltered();
    });

    filtersEl.addEventListener('click', function (e) {
      if (e.target.classList.contains('filter-pill')) {
        filtersEl.querySelectorAll('.filter-pill').forEach(function (p) { p.classList.remove('active'); });
        e.target.classList.add('active');
        currentFilter = e.target.getAttribute('data-filter');
        renderFiltered();
      }
    });
  }

  function loadLeads() {
    listEl.innerHTML =
      '<div class="spinner-overlay">' +
        '<div class="spinner"></div>' +
        '<div class="spinner-text">Cargando leads...</div>' +
      '</div>';

    fetch('/api/leads/index', {
      headers: { 'x-api-key': window.API_KEY }
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (Array.isArray(data)) {
          allLeads = data;
        } else {
          allLeads = [];
          if (data.error) showNotification(data.error, true);
        }
        renderFiltered();
      })
      .catch(function (err) {
        console.error(err);
        listEl.innerHTML = '<div class="empty-state"><p>Error al cargar los leads. Verificá tu API key.</p></div>';
      });
  }

  function renderFiltered() {
    var query = searchInput.value.toLowerCase().trim();

    var filtered = allLeads.filter(function (lead) {
      if (currentFilter !== 'todos') {
        if (currentFilter === 'vendido' || currentFilter === 'baja') {
          if (lead.etapa !== currentFilter) return false;
        } else {
          if (lead.temperatura !== currentFilter) return false;
        }
      }

      if (query) {
        var nombre = (lead.nombre || '').toLowerCase();
        var celular = (lead.celular || '').toLowerCase();
        if (nombre.indexOf(query) === -1 && celular.indexOf(query) === -1) return false;
      }

      return true;
    });

    filtered.sort(function (a, b) {
      if (currentSort === 'score') {
        return (b.score_total || 0) - (a.score_total || 0);
      } else if (currentSort === 'proximo') {
        var fa = a.fecha_proximo_contacto || '9999-12-31';
        var fb = b.fecha_proximo_contacto || '9999-12-31';
        return fa.localeCompare(fb);
      } else if (currentSort === 'dias_sin') {
        return (b.dias_sin_contacto || 0) - (a.dias_sin_contacto || 0);
      }
      return 0;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><p>No se encontraron leads.</p></div>';
      return;
    }

    var html = '';
    for (var i = 0; i < filtered.length; i++) {
      html += renderLeadRow(filtered[i]);
    }
    listEl.innerHTML = html;

    listEl.querySelectorAll('.lead-row').forEach(function (row) {
      row.addEventListener('click', function () {
        var id = this.getAttribute('data-id');
        window.location.href = '/lead.html?id=' + id + '&from=leads';
      });
    });
  }

  function renderLeadRow(lead) {
    var tempClass = 'badge-' + (lead.temperatura || 'fria');
    var scoreClass = getScoreClass(lead.score_total || 0);
    var ultimoContacto = lead.fecha_ultimo_contacto ? calcularTiempoRelativo(lead.fecha_ultimo_contacto) : 'Sin contacto';
    var proximoContacto = lead.fecha_proximo_contacto || 'Sin programar';
    var proximoVencido = lead.fecha_proximo_contacto && lead.fecha_proximo_contacto < new Date().toISOString().split('T')[0];

    return (
      '<div class="lead-row" data-id="' + lead.id + '">' +
        '<div class="lead-row-info">' +
          '<div class="lead-row-name">' +
            escapeHtml(lead.nombre || 'Sin nombre') +
            ' <span class="badge ' + tempClass + '">' + escapeHtml(lead.temperatura || 'fria') + '</span>' +
          '</div>' +
          '<div class="lead-row-meta">' +
            '<span>' + escapeHtml(lead.modelo || 'Sin modelo') + '</span>' +
            '<span class="score-inline ' + scoreClass + '">' + (lead.score_total || 0) + '/25</span>' +
            '<span>' + escapeHtml(lead.etapa || 'nuevo') + '</span>' +
            '<span>' + escapeHtml(ultimoContacto) + '</span>' +
            '<span class="' + (proximoVencido ? 'fecha-vencida' : '') + '">' + escapeHtml(proximoContacto) + '</span>' +
          '</div>' +
        '</div>' +
        '<button class="btn-gestionar" onclick="event.stopPropagation(); window.location.href=\'/lead.html?id=' + lead.id + '&from=leads\'">Gestionar &#8594;</button>' +
      '</div>'
    );
  }

  function getScoreClass(score) {
    if (score <= 8) return 'score-low';
    if (score <= 16) return 'score-mid';
    return 'score-high';
  }

  function calcularTiempoRelativo(fecha) {
    var d = new Date(fecha);
    var diff = new Date() - d;
    var dias = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (dias === 0) return 'Hoy';
    if (dias === 1) return 'Hace 1 día';
    return 'Hace ' + dias + ' días';
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
