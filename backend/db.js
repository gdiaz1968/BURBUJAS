const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('Falta configurar DATABASE_URL en el entorno del backend.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
  max: Number.parseInt(process.env.PG_POOL_MAX || '10', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (error) => {
  console.error('Error inesperado en el pool PostgreSQL:', error.message);
});

module.exports = pool;
