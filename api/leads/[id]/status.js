const { kvGet, kvSet } = require('../../_kv');

module.exports = async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.LEADS_API_KEY) {
    return res.status(401).json({ ok: false, error: 'API key inválida' });
  }

  const { id } = req.query;

  try {
    const lead = await kvGet('lead:' + id);
    if (!lead) {
      return res.status(404).json({ ok: false, error: 'Lead no encontrado' });
    }

    const updates = req.body;
    lead.estado_actual = Object.assign({}, lead.estado_actual, updates);

    await kvSet('lead:' + id, lead);

    const index = (await kvGet('leads:index')) || [];
    const idx = index.findIndex(function (l) { return l.id === id; });
    if (idx >= 0) {
      if (updates.temperatura !== undefined) index[idx].temperatura = updates.temperatura;
      if (updates.etapa !== undefined) index[idx].etapa = updates.etapa;
      if (updates.fecha_ultimo_contacto !== undefined) {
        index[idx].fecha_ultimo_contacto = updates.fecha_ultimo_contacto;
        index[idx].dias_sin_contacto = calcularDiasSinContacto(updates.fecha_ultimo_contacto);
      }
      if (updates.fecha_proximo_contacto !== undefined) index[idx].fecha_proximo_contacto = updates.fecha_proximo_contacto;
      if (updates.proximo_paso !== undefined) index[idx].proximo_paso = updates.proximo_paso;
      await kvSet('leads:index', index);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error actualizando estado:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

function calcularDiasSinContacto(fechaUltimoContacto) {
  if (!fechaUltimoContacto) return 0;
  var ultimo = new Date(fechaUltimoContacto);
  var hoy = new Date();
  var diff = hoy - ultimo;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
