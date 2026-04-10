const { kvGet, kvSet } = require('../../_kv');
const Anthropic = require('@anthropic-ai/sdk');

var SYSTEM_PROMPT = 'Sos un asistente experto en ventas de Plan Óvalo Ford Argentina. Metodología: venta consultiva + SPIN Selling. Reglas: nunca hagas pitch antes de indagar, sé transparente sobre variabilidad de cuotas y mecánica de adjudicación, nunca descartes un lead sin agotar todas las instancias de contacto, todos los modelos Ford son accesibles vía plan de ahorro. El asesor es Juan Manuel Dominguez de Ford Goldstein Mendoza.\n\nTenés acceso al contexto completo del lead. Podés: analizar el caso, sugerir estrategia, generar mensajes de WhatsApp listos para copiar (entre triple backtick), sugerir secuencia de reactivación.\n\nSi el usuario te informa una novedad (llamó, respondió, se vendió, etc.), detectalo y al FINAL de tu respuesta incluí un bloque especial exactamente así:\n|||UPDATE|||\n{\n  "tipo": "nota_vendedor",\n  "detalle": "descripción breve de la novedad",\n  "actualizaciones_estado": { }\n}\n|||END|||\n\nEse bloque no se muestra al usuario, solo se procesa internamente.';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  var id = req.query.id;

  try {
    var lead = await kvGet('lead:' + id);
    if (!lead) {
      return res.status(404).json({ ok: false, error: 'Lead no encontrado' });
    }

    var body = req.body || {};
    var message = body.message;
    var history = body.history;
    if (!message) {
      return res.status(400).json({ ok: false, error: 'Se requiere un mensaje' });
    }

    var client = new Anthropic();

    var contextMessage = 'CONTEXTO DEL LEAD:\n' + JSON.stringify(lead, null, 2);

    var messages = [];
    messages.push({ role: 'user', content: contextMessage });
    messages.push({ role: 'assistant', content: 'Entendido, tengo el contexto completo del lead. ¿En qué puedo ayudarte?' });

    if (history && history.length > 0) {
      for (var i = 0; i < history.length; i++) {
        messages.push({ role: history[i].role, content: history[i].content });
      }
    }

    messages.push({ role: 'user', content: message });

    var response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages
    });

    var responseText = response.content[0].text;
    var updated = false;

    var updateMatch = responseText.match(/\|\|\|UPDATE\|\|\|([\s\S]*?)\|\|\|END\|\|\|/);
    if (updateMatch) {
      try {
        var updateData = JSON.parse(updateMatch[1].trim());

        responseText = responseText.replace(/\|\|\|UPDATE\|\|\|[\s\S]*?\|\|\|END\|\|\|/, '').trim();

        if (updateData.actualizaciones_estado && Object.keys(updateData.actualizaciones_estado).length > 0) {
          lead.estado_actual = Object.assign({}, lead.estado_actual, updateData.actualizaciones_estado);
        }

        var actualizacion = {
          fecha: new Date().toISOString(),
          tipo: updateData.tipo || 'nota_vendedor',
          detalle: updateData.detalle || '',
          actor: 'Juan Manuel Dominguez'
        };

        if (!lead.actualizaciones) lead.actualizaciones = [];
        lead.actualizaciones.push(actualizacion);

        await kvSet('lead:' + id, lead);

        var index = (await kvGet('leads:index')) || [];
        var idx = index.findIndex(function (l) { return l.id === id; });
        if (idx >= 0) {
          var u = updateData.actualizaciones_estado || {};
          if (u.temperatura !== undefined) index[idx].temperatura = u.temperatura;
          if (u.etapa !== undefined) index[idx].etapa = u.etapa;
          if (u.fecha_ultimo_contacto !== undefined) {
            index[idx].fecha_ultimo_contacto = u.fecha_ultimo_contacto;
            var ultimo = new Date(u.fecha_ultimo_contacto);
            index[idx].dias_sin_contacto = Math.floor((new Date() - ultimo) / (1000 * 60 * 60 * 24));
          }
          if (u.fecha_proximo_contacto !== undefined) index[idx].fecha_proximo_contacto = u.fecha_proximo_contacto;
          if (u.proximo_paso !== undefined) index[idx].proximo_paso = u.proximo_paso;
          await kvSet('leads:index', index);
        }

        updated = true;
      } catch (parseErr) {
        console.error('Error parseando bloque UPDATE:', parseErr);
      }
    }

    return res.status(200).json({ ok: true, response: responseText, updated: updated });
  } catch (err) {
    console.error('Error en chat:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
