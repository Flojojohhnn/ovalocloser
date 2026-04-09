const { kv } = require('@vercel/kv');
const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `Sos un asistente experto en ventas de Plan Óvalo Ford Argentina. Metodología: venta consultiva + SPIN Selling. Reglas: nunca hagas pitch antes de indagar, sé transparente sobre variabilidad de cuotas y mecánica de adjudicación, nunca descartes un lead sin agotar todas las instancias de contacto, todos los modelos Ford son accesibles vía plan de ahorro. El asesor es Juan Manuel Dominguez de Ford Goldstein Mendoza.

Tenés acceso al contexto completo del lead. Podés: analizar el caso, sugerir estrategia, generar mensajes de WhatsApp listos para copiar (entre triple backtick), sugerir secuencia de reactivación.

Si el usuario te informa una novedad (llamó, respondió, se vendió, etc.), detectalo y al FINAL de tu respuesta incluí un bloque especial exactamente así:
|||UPDATE|||
{
  "tipo": "nota_vendedor",
  "detalle": "descripción breve de la novedad",
  "actualizaciones_estado": { }
}
|||END|||

Ese bloque no se muestra al usuario, solo se procesa internamente.`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  const { id } = req.query;

  try {
    const lead = await kv.get(`lead:${id}`);
    if (!lead) {
      return res.status(404).json({ ok: false, error: 'Lead no encontrado' });
    }

    const { message, history } = req.body;
    if (!message) {
      return res.status(400).json({ ok: false, error: 'Se requiere un mensaje' });
    }

    const client = new Anthropic();

    const contextMessage = `CONTEXTO DEL LEAD:\n${JSON.stringify(lead, null, 2)}`;

    const messages = [];
    messages.push({ role: 'user', content: contextMessage });
    messages.push({ role: 'assistant', content: 'Entendido, tengo el contexto completo del lead. ¿En qué puedo ayudarte?' });

    if (history && history.length > 0) {
      for (const msg of history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: message });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages
    });

    let responseText = response.content[0].text;
    let updated = false;

    const updateMatch = responseText.match(/\|\|\|UPDATE\|\|\|([\s\S]*?)\|\|\|END\|\|\|/);
    if (updateMatch) {
      try {
        const updateData = JSON.parse(updateMatch[1].trim());

        responseText = responseText.replace(/\|\|\|UPDATE\|\|\|[\s\S]*?\|\|\|END\|\|\|/, '').trim();

        if (updateData.actualizaciones_estado && Object.keys(updateData.actualizaciones_estado).length > 0) {
          lead.estado_actual = { ...lead.estado_actual, ...updateData.actualizaciones_estado };
        }

        const actualizacion = {
          fecha: new Date().toISOString(),
          tipo: updateData.tipo || 'nota_vendedor',
          detalle: updateData.detalle || '',
          actor: 'Juan Manuel Dominguez'
        };

        if (!lead.actualizaciones) lead.actualizaciones = [];
        lead.actualizaciones.push(actualizacion);

        await kv.set(`lead:${id}`, lead);

        const index = (await kv.get('leads:index')) || [];
        const idx = index.findIndex(l => l.id === id);
        if (idx >= 0) {
          if (updateData.actualizaciones_estado) {
            const u = updateData.actualizaciones_estado;
            if (u.temperatura !== undefined) index[idx].temperatura = u.temperatura;
            if (u.etapa !== undefined) index[idx].etapa = u.etapa;
            if (u.fecha_ultimo_contacto !== undefined) {
              index[idx].fecha_ultimo_contacto = u.fecha_ultimo_contacto;
              const ultimo = new Date(u.fecha_ultimo_contacto);
              index[idx].dias_sin_contacto = Math.floor((new Date() - ultimo) / (1000 * 60 * 60 * 24));
            }
            if (u.fecha_proximo_contacto !== undefined) index[idx].fecha_proximo_contacto = u.fecha_proximo_contacto;
            if (u.proximo_paso !== undefined) index[idx].proximo_paso = u.proximo_paso;
          }
          await kv.set('leads:index', index);
        }

        updated = true;
      } catch (parseErr) {
        console.error('Error parseando bloque UPDATE:', parseErr);
      }
    }

    return res.status(200).json({ ok: true, response: responseText, updated });
  } catch (err) {
    console.error('Error en chat:', err);
    return res.status(500).json({ ok: false, error: 'Error al procesar el chat' });
  }
};
