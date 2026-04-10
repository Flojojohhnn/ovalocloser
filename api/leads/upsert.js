const { kvGet, kvSet } = require('../_kv');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.LEADS_API_KEY) {
    return res.status(401).json({ ok: false, error: 'API key inválida' });
  }

  try {
    const lead = req.body;
    if (!lead || !lead.id) {
      return res.status(400).json({ ok: false, error: 'Se requiere un lead con id' });
    }

    const existing = await kvGet('lead:' + lead.id);
    const action = existing ? 'updated' : 'created';

    await kvSet('lead:' + lead.id, lead);

    const index = (await kvGet('leads:index')) || [];

    const diasSinContacto = calcularDiasSinContacto(lead.estado_actual && lead.estado_actual.fecha_ultimo_contacto);

    const resumen = {
      id: lead.id,
      nombre: (lead.contacto && lead.contacto.nombre) || '',
      modelo: (lead.interes && lead.interes.modelo) || '',
      temperatura: (lead.estado_actual && lead.estado_actual.temperatura) || 'fria',
      score_total: (lead.scoring && lead.scoring.score_total) || 0,
      etapa: (lead.estado_actual && lead.estado_actual.etapa) || 'nuevo',
      fecha_ultimo_contacto: (lead.estado_actual && lead.estado_actual.fecha_ultimo_contacto) || null,
      fecha_proximo_contacto: (lead.estado_actual && lead.estado_actual.fecha_proximo_contacto) || null,
      proximo_paso: (lead.estado_actual && lead.estado_actual.proximo_paso) || null,
      vendedor: (lead.estado_actual && lead.estado_actual.vendedor_asignado) || 'Juan Manuel Dominguez',
      alerta: null,
      dias_sin_contacto: diasSinContacto
    };

    const idx = index.findIndex(function (l) { return l.id === lead.id; });
    if (idx >= 0) {
      index[idx] = resumen;
    } else {
      index.push(resumen);
    }

    await kvSet('leads:index', index);

    return res.status(200).json({ ok: true, id: lead.id, action: action });
  } catch (err) {
    console.error('Error en upsert:', err);
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
