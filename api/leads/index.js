const { kvGet } = require('../_kv');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.LEADS_API_KEY) {
    return res.status(401).json({ ok: false, error: 'API key inválida' });
  }

  try {
    const index = await kvGet('leads:index');
    return res.status(200).json(index || []);
  } catch (err) {
    console.error('Error leyendo leads:index:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
