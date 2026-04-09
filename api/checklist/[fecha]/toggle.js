const { kv } = require('@vercel/kv');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  const { fecha } = req.query;

  try {
    const { check_id, completado } = req.body;
    if (!check_id || completado === undefined) {
      return res.status(400).json({ ok: false, error: 'Se requiere check_id y completado' });
    }

    const checklist = (await kv.get(`checklist:${fecha}`)) || [];
    const idx = checklist.findIndex(item => item.id === check_id);

    if (idx < 0) {
      return res.status(404).json({ ok: false, error: 'Ítem no encontrado' });
    }

    checklist[idx].completado = completado;
    checklist[idx].timestamp_completado = completado ? new Date().toISOString() : null;

    await kv.set(`checklist:${fecha}`, checklist);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error en toggle:', err);
    return res.status(500).json({ ok: false, error: 'Error al actualizar el checklist' });
  }
};
