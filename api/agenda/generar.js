const { kv } = require('@vercel/kv');
const Anthropic = require('@anthropic-ai/sdk');

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  try {
    const { fecha, hora_actual } = req.body;
    if (!fecha || !hora_actual) {
      return res.status(400).json({ ok: false, error: 'Se requiere fecha y hora_actual' });
    }

    const existente = await kv.get(`checklist:${fecha}`);
    if (existente) {
      return res.status(200).json({
        ok: true,
        resumen: 'Agenda ya generada previamente.',
        checklist_completo: existente
      });
    }

    const index = (await kv.get('leads:index')) || [];

    const fechaObj = new Date(fecha + 'T12:00:00');
    const diaSemana = fechaObj.getDay();
    const diaNombre = DIAS_SEMANA[diaSemana];

    const ayer = new Date(fechaObj);
    ayer.setDate(ayer.getDate() - 1);
    const ayerStr = ayer.toISOString().split('T')[0];
    const checklistAyer = (await kv.get(`checklist:${ayerStr}`)) || [];
    const pendientesAyer = checklistAyer.filter(item => !item.completado);

    let horarioDisponible = '';
    if (diaSemana === 6) {
      horarioDisponible = '09:00-13:00';
    } else if (diaSemana >= 1 && diaSemana <= 5) {
      horarioDisponible = '09:00-13:30 y 15:00-18:00';
    } else {
      horarioDisponible = 'No hay horario laboral (Domingo)';
    }

    if (hora_actual > '09:00') {
      horarioDisponible += ` (comenzando desde ${hora_actual})`;
    }

    const pendientesInfo = pendientesAyer.map(p => {
      const horasAtraso = calcularHorasAtraso(ayerStr, p.hora_sugerida);
      return {
        ...p,
        horas_atraso: horasAtraso,
        era_pendiente_de: ayerStr
      };
    });

    const userMessage = `Fecha: ${fecha}
Día de la semana: ${diaNombre}
Hora actual: ${hora_actual}
Horario disponible: ${horarioDisponible}

PENDIENTES DE AYER (${ayerStr}) - ${pendientesInfo.length} pendientes:
${pendientesInfo.length > 0 ? JSON.stringify(pendientesInfo, null, 2) : 'Ninguno'}

ÍNDICE COMPLETO DE LEADS (${index.length} leads):
${JSON.stringify(index, null, 2)}

Generá la agenda del día priorizando: temperatura caliente > score alto > fecha_proximo_contacto vencida o de hoy > dias_sin_contacto alto.
Cada bloque de gestión: 15 minutos. Dejar 5 minutos entre gestiones.
Los IDs de los ítems del checklist deben seguir el formato check_TIMESTAMP_001, check_TIMESTAMP_002, etc. usando el timestamp actual.`;

    const client = new Anthropic();

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: 'Sos un asistente de planificación de ventas. Generás la agenda diaria de Juan Manuel Dominguez, asesor de Plan Óvalo Ford Goldstein Mendoza. Devolvés ÚNICAMENTE un JSON válido sin texto adicional, sin markdown, sin explicaciones.',
      messages: [{ role: 'user', content: userMessage }]
    });

    let responseText = response.content[0].text.trim();

    if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    let agenda;
    try {
      agenda = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('Error parseando respuesta de Claude:', parseErr, responseText);
      return res.status(500).json({ ok: false, error: 'Error al parsear la agenda generada' });
    }

    const checklist = agenda.checklist_completo || [];

    await kv.set(`checklist:${fecha}`, checklist);

    return res.status(200).json({
      ok: true,
      resumen: agenda.resumen || '',
      checklist_completo: checklist
    });
  } catch (err) {
    console.error('Error generando agenda:', err);
    return res.status(500).json({ ok: false, error: 'Error al generar la agenda' });
  }
};

function calcularHorasAtraso(fecha, hora) {
  const entonces = new Date(`${fecha}T${hora || '18:00'}:00`);
  const ahora = new Date();
  const diff = ahora - entonces;
  return Math.max(0, Math.round(diff / (1000 * 60 * 60)));
}
