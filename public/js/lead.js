(function () {
  var params = new URLSearchParams(window.location.search);
  var leadId = params.get('id');
  var fromPage = params.get('from') || 'leads';
  var lead = null;

  var backBtn = document.getElementById('back-btn');
  var leadNameEl = document.getElementById('lead-name');
  var leadModelEl = document.getElementById('lead-model');
  var leadTempBadge = document.getElementById('lead-temp-badge');
  var tabFicha = document.getElementById('tab-ficha');
  var tabHistorial = document.getElementById('tab-historial');
  var tabEstado = document.getElementById('tab-estado');
  var chatMessages = document.getElementById('chat-messages');
  var chatInput = document.getElementById('chat-input');
  var chatSendBtn = document.getElementById('chat-send');

  function getApiKey() {
    return localStorage.getItem('ovalo_leads_api_key') || '';
  }

  function checkApiKey() {
    var modal = document.getElementById('apikey-modal');
    if (!getApiKey()) {
      modal.style.display = 'flex';
      document.getElementById('apikey-save').addEventListener('click', function () {
        var val = document.getElementById('apikey-input').value.trim();
        if (val) {
          localStorage.setItem('ovalo_leads_api_key', val);
          modal.style.display = 'none';
          loadLead();
        }
      });
      return false;
    }
    modal.style.display = 'none';
    return true;
  }

  if (!leadId) {
    leadNameEl.textContent = 'Lead no especificado';
    return;
  }

  backBtn.addEventListener('click', function () {
    if (fromPage === 'agenda') {
      window.location.href = '/';
    } else {
      window.location.href = '/leads';
    }
  });

  // Tabs
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.remove('active'); });
      this.classList.add('active');
      document.getElementById('tab-' + this.getAttribute('data-tab')).classList.add('active');
    });
  });

  // Chat
  chatSendBtn.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });

  if (!checkApiKey()) {
    loadChatHistory();
    return;
  }
  loadLead();
  loadChatHistory();

  function loadLead() {
    fetch('/api/leads/' + leadId, {
      headers: { 'x-api-key': getApiKey() }
    })
      .then(function (res) {
        if (res.status === 404) throw new Error('Lead no encontrado');
        return res.json();
      })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        lead = data;
        renderHeader();
        renderFicha();
        renderHistorial();
        renderEstado();
      })
      .catch(function (err) {
        leadNameEl.textContent = err.message || 'Error al cargar';
        showNotification(err.message, true);
      });
  }

  function renderHeader() {
    leadNameEl.textContent = lead.contacto?.nombre || 'Sin nombre';
    leadModelEl.textContent = lead.interes?.modelo || '';
    var temp = lead.estado_actual?.temperatura || 'fria';
    leadTempBadge.className = 'badge badge-' + temp;
    leadTempBadge.textContent = temp;
    document.title = (lead.contacto?.nombre || 'Lead') + ' - Óvalo Leads';
  }

  function renderFicha() {
    var c = lead.contacto || {};
    var inter = lead.interes || {};
    var sc = lead.scoring || {};
    var ia = lead.analisis_ia || {};

    var celularLimpio = limpiarCelular(c.celular || '');

    var html = '';

    // Contacto
    html += '<div class="section-title">Contacto</div>';
    html += '<div class="card">';
    html += '<div class="info-grid">';
    html += infoItem('Nombre', c.nombre);
    html += infoItem('Celular', c.celular ? '<a href="tel:' + celularLimpio + '">' + escapeHtml(c.celular) + '</a>' : '-', true);
    html += infoItem('Email', c.email || '-');
    html += infoItem('Ciudad', c.ciudad || '-');
    html += infoItem('Origen', c.origen || '-');
    html += infoItem('Fecha consulta', c.fecha_consulta_original || '-');
    html += '</div>';
    if (celularLimpio) {
      html += '<div style="margin-top:12px"><a href="https://wa.me/' + celularLimpio + '" target="_blank" class="btn btn-whatsapp btn-small">WhatsApp</a></div>';
    }
    html += '</div>';

    // Interés
    html += '<div class="section-title">Interés</div>';
    html += '<div class="card">';
    html += '<div class="info-grid">';
    html += infoItem('Modelo', inter.modelo || '-');
    html += infoItem('Versión', inter.version || '-');
    html += infoItem('Uso declarado', inter.uso_declarado || '-');
    html += infoItem('Plazo decisión', inter.plazo_decision || '-');
    html += infoItem('Vehículo actual', inter.tiene_vehiculo_actual != null ? (inter.tiene_vehiculo_actual ? 'Sí' : 'No') : '-');
    html += infoItem('Motivo compra', inter.motivo_compra || '-');
    html += '</div>';
    html += '</div>';

    // Scoring
    html += '<div class="section-title">Scoring</div>';
    html += '<div class="card">';
    var scoreTotal = sc.score_total || 0;
    var scoreClass = scoreTotal <= 8 ? 'score-low' : (scoreTotal <= 16 ? 'score-mid' : 'score-high');

    html += '<div class="score-circle-container">';
    html += '<div class="score-circle ' + scoreClass + '">' + scoreTotal + '/25</div>';
    html += '<div class="score-bars">';
    html += scoreBar('Temperatura', sc.temperatura || 0, 5);
    html += scoreBar('Aptitud Financiera', sc.aptitud_financiera || 0, 5);
    html += scoreBar('Calidad Gestión', sc.calidad_gestion_previa || 0, 5);
    html += scoreBar('SPIN Situación', sc.spin_situacion || 0, 5);
    html += scoreBar('SPIN Problema', sc.spin_problema || 0, 5);
    html += scoreBar('SPIN Implicación', sc.spin_implicacion || 0, 5);
    html += scoreBar('SPIN Necesidad', sc.spin_necesidad || 0, 5);
    html += '</div>';
    html += '</div>';
    if (sc.notas_scoring) {
      html += '<p style="font-size:0.8rem;color:var(--text-secondary);margin-top:8px">' + escapeHtml(sc.notas_scoring) + '</p>';
    }
    html += '</div>';

    // Análisis IA
    if (ia.diagnostico || ia.estrategia_recomendada || ia.proxima_accion_sugerida) {
      html += '<div class="section-title">Análisis IA</div>';
      html += '<div class="ia-box">';
      if (ia.diagnostico) {
        html += '<div class="ia-label">Diagnóstico</div>';
        html += '<p>' + escapeHtml(ia.diagnostico) + '</p>';
      }
      if (ia.estrategia_recomendada) {
        html += '<div class="ia-label">Estrategia recomendada</div>';
        html += '<p>' + escapeHtml(ia.estrategia_recomendada) + '</p>';
      }
      if (ia.proxima_accion_sugerida) {
        html += '<div class="ia-label">Próxima acción sugerida</div>';
        html += '<p>' + escapeHtml(ia.proxima_accion_sugerida) + '</p>';
      }
      html += '</div>';
    }

    tabFicha.innerHTML = html;
  }

  function renderHistorial() {
    var timeline = (lead.linea_temporal || []).concat(lead.actualizaciones || []);

    timeline.sort(function (a, b) {
      var fa = a.fecha || a.fecha_evento || '';
      var fb = b.fecha || b.fecha_evento || '';
      return fb.localeCompare(fa);
    });

    if (timeline.length === 0) {
      tabHistorial.innerHTML = '<div class="empty-state"><p>Sin historial registrado.</p></div>';
      return;
    }

    var html = '<div class="timeline">';
    for (var i = 0; i < timeline.length; i++) {
      var entry = timeline[i];
      var tipo = entry.tipo || 'nota_vendedor';
      var fecha = entry.fecha || entry.fecha_evento || '';
      var actor = entry.actor || entry.origen || '';
      var detalle = entry.detalle || entry.descripcion || '';

      html +=
        '<div class="timeline-item">' +
          '<div class="timeline-dot tipo-' + tipo + '"></div>' +
          '<div class="timeline-fecha">' + formatearFecha(fecha) + '</div>' +
          '<span class="timeline-badge tipo-' + tipo + '">' + escapeHtml(tipo.replace(/_/g, ' ')) + '</span>' +
          (actor ? '<div class="timeline-actor">' + escapeHtml(actor) + '</div>' : '') +
          '<div class="timeline-detalle">' + escapeHtml(detalle) + '</div>' +
        '</div>';
    }
    html += '</div>';

    tabHistorial.innerHTML = html;
  }

  function renderEstado() {
    var ea = lead.estado_actual || {};

    var etapas = ['nuevo', 'primer_contacto', 'seguimiento_activo', 'seguimiento_frio', 'hibernado', 'vendido', 'baja'];
    var temperaturas = ['caliente', 'tibia', 'fria'];

    var html = '<div class="card" style="transform:none !important;box-shadow:none !important">';

    html += '<div class="form-group">';
    html += '<label class="form-label">Etapa</label>';
    html += '<select class="form-select" id="est-etapa">';
    for (var i = 0; i < etapas.length; i++) {
      html += '<option value="' + etapas[i] + '"' + (ea.etapa === etapas[i] ? ' selected' : '') + '>' + escapeHtml(etapas[i].replace(/_/g, ' ')) + '</option>';
    }
    html += '</select>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label class="form-label">Temperatura</label>';
    html += '<select class="form-select" id="est-temperatura">';
    for (var j = 0; j < temperaturas.length; j++) {
      html += '<option value="' + temperaturas[j] + '"' + (ea.temperatura === temperaturas[j] ? ' selected' : '') + '>' + escapeHtml(temperaturas[j]) + '</option>';
    }
    html += '</select>';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label class="form-label">Resultado último contacto</label>';
    html += '<input type="text" class="form-input" id="est-resultado" value="' + escapeAttr(ea.resultado_ultimo_contacto || '') + '">';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label class="form-label">Fecha último contacto</label>';
    html += '<input type="date" class="form-input" id="est-fecha-ultimo" value="' + escapeAttr(ea.fecha_ultimo_contacto || '') + '">';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label class="form-label">Próximo paso</label>';
    html += '<input type="text" class="form-input" id="est-proximo-paso" value="' + escapeAttr(ea.proximo_paso || '') + '">';
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label class="form-label">Fecha próximo contacto</label>';
    html += '<input type="date" class="form-input" id="est-fecha-proximo" value="' + escapeAttr(ea.fecha_proximo_contacto || '') + '">';
    html += '</div>';

    html += '<button class="btn btn-primary" id="btn-guardar-estado" style="width:100%;margin-top:8px">Guardar cambios</button>';
    html += '</div>';

    tabEstado.innerHTML = html;

    document.getElementById('btn-guardar-estado').addEventListener('click', guardarEstado);
  }

  function guardarEstado() {
    var btn = document.getElementById('btn-guardar-estado');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    var updates = {
      etapa: document.getElementById('est-etapa').value,
      temperatura: document.getElementById('est-temperatura').value,
      resultado_ultimo_contacto: document.getElementById('est-resultado').value || null,
      fecha_ultimo_contacto: document.getElementById('est-fecha-ultimo').value || null,
      proximo_paso: document.getElementById('est-proximo-paso').value || null,
      fecha_proximo_contacto: document.getElementById('est-fecha-proximo').value || null
    };

    fetch('/api/leads/' + leadId + '/status', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getApiKey()
      },
      body: JSON.stringify(updates)
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        btn.disabled = false;
        btn.textContent = 'Guardar cambios';
        if (data.ok) {
          showNotification('Estado actualizado correctamente');
          lead.estado_actual = Object.assign(lead.estado_actual || {}, updates);
          renderHeader();
        } else {
          showNotification(data.error || 'Error al guardar', true);
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = 'Guardar cambios';
        showNotification('Error de conexión', true);
      });
  }

  // ─── CHAT ───

  function getChatStorageKey() {
    return 'ovalo_chat_' + leadId;
  }

  function loadChatHistory() {
    var stored = sessionStorage.getItem(getChatStorageKey());
    if (!stored) return;
    try {
      var history = JSON.parse(stored);
      for (var i = 0; i < history.length; i++) {
        appendChatMessage(history[i].role, history[i].content, false);
      }
      scrollChatToBottom();
    } catch (e) { /* ignore */ }
  }

  function saveChatHistory() {
    var msgs = [];
    chatMessages.querySelectorAll('.chat-msg').forEach(function (el) {
      var role = el.classList.contains('chat-msg-user') ? 'user' : 'assistant';
      msgs.push({ role: role, content: el.getAttribute('data-raw') || el.textContent });
    });
    sessionStorage.setItem(getChatStorageKey(), JSON.stringify(msgs));
  }

  function getSessionHistory() {
    var stored = sessionStorage.getItem(getChatStorageKey());
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch (e) {
      return [];
    }
  }

  function sendChat() {
    var message = chatInput.value.trim();
    if (!message) return;

    chatInput.value = '';
    appendChatMessage('user', message, true);

    chatSendBtn.disabled = true;
    chatSendBtn.textContent = '...';

    var history = getSessionHistory();
    // Remove the last message (which is the one we just added) from history sent to API
    var historyForApi = history.slice(0, -1);

    fetch('/api/leads/' + leadId + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message, history: historyForApi })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        chatSendBtn.disabled = false;
        chatSendBtn.textContent = 'Enviar';

        if (!data.ok) {
          showNotification(data.error || 'Error en el chat', true);
          return;
        }

        appendChatMessage('assistant', data.response, true);

        if (data.updated) {
          showNotification('Lead actualizado');
          loadLead();
        }
      })
      .catch(function () {
        chatSendBtn.disabled = false;
        chatSendBtn.textContent = 'Enviar';
        showNotification('Error de conexión', true);
      });
  }

  function appendChatMessage(role, content, save) {
    var msgEl = document.createElement('div');
    msgEl.className = 'chat-msg ' + (role === 'user' ? 'chat-msg-user' : 'chat-msg-assistant');
    msgEl.setAttribute('data-raw', content);

    if (role === 'assistant') {
      msgEl.innerHTML = renderMarkdown(content);
    } else {
      msgEl.textContent = content;
    }

    chatMessages.appendChild(msgEl);
    scrollChatToBottom();

    if (save) {
      saveChatHistory();
    }
  }

  function scrollChatToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function renderMarkdown(text) {
    // Handle code blocks
    var parts = text.split(/(```[\s\S]*?```)/g);
    var result = '';

    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (part.startsWith('```') && part.endsWith('```')) {
        var code = part.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
        var blockId = 'code-' + Date.now() + '-' + i;
        result +=
          '<div class="chat-code-block" id="' + blockId + '">' +
            escapeHtml(code) +
            '<button class="chat-code-copy" onclick="copiarCodigo(\'' + blockId + '\')">Copiar</button>' +
          '</div>';
      } else {
        result += renderInlineMarkdown(part);
      }
    }

    return result;
  }

  function renderInlineMarkdown(text) {
    var html = escapeHtml(text);
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    // Fix nested ul
    html = html.replace(/<\/ul>\s*<ul>/g, '');
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  // Global function for copy buttons
  window.copiarCodigo = function (blockId) {
    var block = document.getElementById(blockId);
    if (!block) return;
    var text = block.textContent.replace('Copiar', '').trim();
    navigator.clipboard.writeText(text).then(function () {
      var btn = block.querySelector('.chat-code-copy');
      if (btn) {
        btn.textContent = 'Copiado!';
        setTimeout(function () { btn.textContent = 'Copiar'; }, 1500);
      }
    });
  };

  // ─── HELPERS ───

  function infoItem(label, value, isHtml) {
    return (
      '<div class="info-item">' +
        '<div class="info-label">' + escapeHtml(label) + '</div>' +
        '<div class="info-value">' + (isHtml ? value : escapeHtml(value || '-')) + '</div>' +
      '</div>'
    );
  }

  function scoreBar(label, value, max) {
    var pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
      '<div class="score-bar-item">' +
        '<div class="score-bar-label"><span>' + escapeHtml(label) + '</span><span>' + value + '/' + max + '</span></div>' +
        '<div class="score-bar-track"><div class="score-bar-fill" style="width:' + pct + '%"></div></div>' +
      '</div>'
    );
  }

  function limpiarCelular(cel) {
    return cel.replace(/[\s\-\(\)\.]/g, '');
  }

  function formatearFecha(fecha) {
    if (!fecha) return '-';
    try {
      var d = new Date(fecha);
      return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return fecha;
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  }

  function escapeAttr(text) {
    return escapeHtml(text).replace(/"/g, '&quot;');
  }

  function showNotification(msg, isError) {
    var el = document.createElement('div');
    el.className = 'notification' + (isError ? ' error' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }
})();
