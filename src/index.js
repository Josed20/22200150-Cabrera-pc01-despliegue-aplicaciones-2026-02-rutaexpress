require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const INSTANCE_ID = process.env.INSTANCE_ID || 'app-unknown';
const PORT = process.env.PORT || 3000;

// Pool de conexión a PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'enviosdb',
  user: process.env.DB_USER || 'enviosuser',
  password: process.env.DB_PASSWORD || 'enviospassword',
});

// Middleware global: añadir siempre la cabecera X-Instance-ID identificando a la réplica
app.use((req, res, next) => {
  res.setHeader('X-Instance-ID', INSTANCE_ID);
  next();
});

// Función auxiliar para registrar intentos en la base de datos
async function registrarIntento({ metodo, ruta, resultado, envioId = null, idempotencyKey = null, clienteIp = null, httpCode }) {
  try {
    const intentoId = uuidv4();
    await pool.query(
      `INSERT INTO intentos (id, fecha_hora, metodo, ruta, instancia, resultado, envio_id, idempotency_key, cliente_ip, http_code)
       VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9)`,
      [intentoId, metodo, ruta, INSTANCE_ID, resultado, envioId, idempotencyKey, clienteIp, httpCode]
    );
  } catch (err) {
    console.error(`[${INSTANCE_ID}] Error registrando intento:`, err.message);
  }
}

// ==============================================================================
// POST /envios — Registrar envío con prevención de duplicados
// ==============================================================================
app.post('/envios', async (req, res) => {
  const { destinatario, direccion } = req.body || {};
  // Soporta clave de idempotencia tanto por Header HTTP como por Body JSON
  const idempotencyKey = req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotency_key || null;
  const clienteIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  // Validación de datos obligatorios
  if (!destinatario || typeof destinatario !== 'string' ||
      !direccion    || typeof direccion    !== 'string') {
    await registrarIntento({
      metodo: 'POST',
      ruta: '/envios',
      resultado: 'RECHAZADO',
      idempotencyKey,
      clienteIp,
      httpCode: 400
    });
    return res.status(400).json({
      error: 'destinatario y direccion son obligatorios y deben ser de tipo string'
    });
  }

  const client = await pool.connect();
  try {
    // 1. Si se envía idempotencyKey, verificar si ya existe un envío registrado previamente
    if (idempotencyKey) {
      const existing = await client.query(
        'SELECT id, destinatario, direccion, created_at FROM envios WHERE idempotency_key = $1',
        [idempotencyKey]
      );

      if (existing.rows.length > 0) {
        const envioExistente = existing.rows[0];
        await registrarIntento({
          metodo: 'POST',
          ruta: '/envios',
          resultado: 'REINTENTO_DUPLICADO',
          envioId: envioExistente.id,
          idempotencyKey,
          clienteIp,
          httpCode: 200
        });

        // Retorna HTTP 200 con el envío existente (sin duplicar)
        return res.status(200).json({
          id: envioExistente.id,
          destinatario: envioExistente.destinatario,
          direccion: envioExistente.direccion,
          duplicado: true
        });
      }
    }

    // 2. Registrar el nuevo envío en PostgreSQL
    const newId = uuidv4();
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO envios (id, destinatario, direccion, idempotency_key, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, destinatario, direccion`,
      [newId, destinatario, direccion, idempotencyKey]
    );

    // Confirmar en PostgreSQL ANTES de cualquier demora
    await client.query('COMMIT');

    // Registrar intento aceptado
    await registrarIntento({
      metodo: 'POST',
      ruta: '/envios',
      resultado: 'ACEPTADO',
      envioId: newId,
      idempotencyKey,
      clienteIp,
      httpCode: 201
    });

    // 3. Simulación de demora requerida para la prueba de timeout
    // El registro ya se completó en PostgreSQL antes de esta espera
    if (process.env.SIMULATE_DELAY === 'true') {
      console.log(`[${INSTANCE_ID}] Demorando respuesta 5 segundos (SIMULATE_DELAY activo)...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    return res.status(201).json(result.rows[0]);

  } catch (err) {
    await client.query('ROLLBACK');

    // Manejo de condición de carrera concurrente (código Postgres 23505: unique_violation)
    if (err.code === '23505' && idempotencyKey) {
      const existing = await pool.query(
        'SELECT id, destinatario, direccion FROM envios WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      if (existing.rows.length > 0) {
        await registrarIntento({
          metodo: 'POST',
          ruta: '/envios',
          resultado: 'REINTENTO_CONCURRENTE_DUPLICADO',
          envioId: existing.rows[0].id,
          idempotencyKey,
          clienteIp,
          httpCode: 200
        });
        return res.status(200).json({
          id: existing.rows[0].id,
          destinatario: existing.rows[0].destinatario,
          direccion: existing.rows[0].direccion,
          duplicado: true
        });
      }
    }

    console.error(`[${INSTANCE_ID}] Error en POST /envios:`, err.message);
    await registrarIntento({
      metodo: 'POST',
      ruta: '/envios',
      resultado: 'ERROR',
      idempotencyKey,
      clienteIp,
      httpCode: 500
    });
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// ==============================================================================
// GET /health — Verificación de conexión con PostgreSQL
// ==============================================================================
app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as now');
    return res.status(200).json({
      status: 'ok',
      database: 'connected',
      instance: INSTANCE_ID,
      timestamp: result.rows[0].now
    });
  } catch (err) {
    return res.status(503).json({
      status: 'error',
      database: 'disconnected',
      instance: INSTANCE_ID,
      error: err.message
    });
  }
});

// ==============================================================================
// GET /envios — Listar todos los envíos (auditoría / comprobación)
// ==============================================================================
app.get('/envios', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, destinatario, direccion, idempotency_key, created_at FROM envios ORDER BY created_at DESC'
    );
    return res.status(200).json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ==============================================================================
// GET /intentos — Consultar el registro persistente de auditoría
// ==============================================================================
app.get('/intentos', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, fecha_hora, metodo, ruta, instancia, resultado, envio_id, idempotency_key, cliente_ip, http_code FROM intentos ORDER BY fecha_hora DESC LIMIT 100'
    );
    return res.status(200).json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[${INSTANCE_ID}] Servidor escuchando en puerto ${PORT}`);
});
