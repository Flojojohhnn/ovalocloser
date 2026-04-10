const { kvGet, kvSet } = require('../_kv');
const Anthropic = require('@anthropic-ai/sdk');

var DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  try {
    var body = req.body || {};
    var fecha = body.fecha;
    var hora_actual = body.hora_actual;
    if (!fecha || !hora_actual) {
      return res.status(400).json({ ok: false, error: 'Se requiere fecha y hora_actual' });
    }

    var existente = await kvGet('checklist:' + fecha);
    if (existente) {
      return res.status(200).json({
        ok: true,
        resumen: 'Agenda ya generada previamente.',
        checklist_completo: existente
      });
    }

    var index = (await kvGet('leads:index')) || [];

    if (index.length === 0) {
      var checklistVacio = [];
      await kvSet('checklist:' + fecha, checklistVacio);
      return res.status(200).json({
        ok: true,
        resumen: 'No hay leads cargados aún. Cargá leads para poder generar la agenda.',
        checklist_completo: checklistVacio
      });
    }

    var fechaObj = new Date(fecha + 'T12:00:00');
    var diaSemana = fechaObj.getDay();
    var diaNombre = DIAS_SEMANA[diaSemana];

    var ayer = new Date(fechaObj);
    ayer.setDate(ayer.getDate() - 1);
    var ayerStr = ayer.toISOString().split('T')[0];
    var checklistAyer = (await kvGet('checklist:' + ayerStr)) || [];
    var pendientesAyer = checklistAyer.filter(function (item) { return !item.completado; });

    var horarioDisponible = '';
    if (diaSemana === 6) {
      horarioDisponible = '09:00-13:00';
    } else if (diaSemana >= 1 && diaSemana <= 5) {
      horarioDisponible = '09:00-13:30 y 15:00-18:00';
    } else {
      horarioDisponible = 'No hay horario laboral (Domingo)';
    }

    if (hora_actual > '09:00') {
      horarioDisponible += ' (comenzando desde ' + hora_actual + ')';
    }

    var pendientesInfo = pendientesAyer.map(function (p) {
      var horasAtraso = calcularHorasAtraso(ayerStr, p.hora_sugerida);
      return Object.assign({}, p, {
        horas_atraso: horasAtraso,
        era_pendiente_de: ayerStr
      });
    });

    var userMessage = 'Fecha: ' + fecha + '\n' +
      'Día de la semana: ' + diaNombre + '\n' +
      'Hora actual: ' + hora_actual + '\n' +
      'Horario disponible: ' + horarioDisponible + '\n\n' +
      'PENDIENTES DE AYER (' + ayerStr + ') - ' + pendientesInfo.length + ' pendientes:\n' +
      (pendientesInfo.length > 0 ? JSON.stringify(pendientesInfo, null, 2) : 'Ninguno') + '\n\n' +
      'ÍNDICE COMPLETO DE LEADS (' + index.length + ' leads):\n' +
      JSON.stringify(index, null, 2) + '\n\n' +
      'Generá la agenda del día priorizando: temperatura caliente > score alto > fecha_proximo_contacto vencida o de hoy > dias_sin_contacto alto.\n' +
      'Cada bloque de gestión: 15 minutos. Dejar 5 minutos entre gestiones.\n' +
      'Los IDs de los ítems del checklist deben seguir el formato check_TIMESTAMP_001, check_TIMESTAMP_002, etc. usando el timestamp actual.';

    var client = new Anthropic();

    var response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: 'Sos un asistente de planificación de ventas. Generás la agenda diaria de Juan Manuel Dominguez, asesor de Plan Óvalo Ford Goldstein Mendoza. Devolvés ÚNICAMENTE un JSON válido sin texto adicional, sin markdown, sin explicaciones.',
      messages: [{ role: 'user', content: userMessage }]
    });

    var responseText = response.content[0].text.trim();

    if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    var agenda;
    try {
      agenda = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('Error parseando respuesta de Claude:', parseErr, 'Respuesta:', responseText);
      return res.status(500).json({ ok: false, error: 'Error al parsear la agenda generada por IA' });
    }

    var checklist = agenda.checklist_completo || [];

    await kvSet('checklist:' + fecha, checklist);

    return res.status(200).json({
      ok: true,
      resumen: agenda.resumen || '',
      checklist_completo: checklist
    });
  } catch (err) {
    console.error('Error generando agenda:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

function calcularHorasAtraso(fecha, hora) {
  var entonces = new Date(fecha + 'T' + (hora || '18:00') + ':00');
  var ahora = new Date();
  var diff = ahora - entonces;
  return Math.max(0, Math.round(diff / (1000 * 60 * 60)));
}
