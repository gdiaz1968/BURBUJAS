require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pool = require('./db');
const formulacionesRoutes = require('./routes/formulaciones');

const app = express();
const PORT = Number.parseInt(process.env.PORT || '3030', 10);

app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origen no autorizado por CORS.'));
  },
}));

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, servicio: 'BURBUJA API', base_datos: 'conectada' });
  } catch (_error) {
    res.status(503).json({ ok: false, servicio: 'BURBUJA API', base_datos: 'sin conexión' });
  }
});

app.use('/api/formulaciones', formulacionesRoutes);

app.use((error, _req, res, _next) => {
  if (error.message === 'Origen no autorizado por CORS.') {
    return res.status(403).json({ error: error.message });
  }
  console.error('Error no controlado:', error.message);
  return res.status(500).json({ error: 'Error interno del servidor.' });
});

app.listen(PORT, () => {
  console.log(`BURBUJA API escuchando en el puerto ${PORT}`);
});
