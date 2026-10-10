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
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'enviosdb',
  user: process.env.DB_USER || 'enviosuser',
  password: process.env.DB_PASSWORD || 'enviospassword',
});

// Middleware: registrar cada intento en la tabla de logs
app.use(async (req, res, next) => {
  const logId = uuidv4();
  req.logId = logId;
  req.startTime = Date.now();

  // Guardamos la referencia original de res.json para interceptarla
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    // Registrar el intento en la BD
    const httpCode = res.statusCode;
    const envioId = body && body.id ? body.id : null;
    const resultado = httpCode >= 200 && httpCode < 300 ? 'ACEPTADO' : httpCode === 409 ? 'DUPLICADO' : 'RECHAZADO';

    pool.query(
      `INSERT INTO intentos (id, fecha_hora, metodo, ruta, instancia, resultado, envio_id, http_code)
       VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7)`,
      [logId, req.method, req.path, INSTANCE_ID, resultado, envioId, httpCode]
    ).catch(err => console.error('Error registrando intento:', err.message));

    return originalJson(body);
  };

  next();
});

// POST /envios — Registrar un nuevo envío (con prevención de duplicados)
app.post('/envios', async (req, res) => {
  const { destinatario, direccion, idempotency_key } = req.body;

  // Validar campos obligatorios
  if (!destinatario || typeof destinatario !== 'string' ||
      !direccion   || typeof direccion   !== 'string') {
    return res.status(400).json({ error: 'destinatario y direccion son obligatorios y deben ser string' });
  }

  // idempotency_key es opcional pero, si se provee, previene duplicados
  // Si no se provee, siempre se crea un envío nuevo
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (idempotency_key) {
      // Buscar si ya existe un envío con esta clave de idempotencia
      const existing = await client.query(
        'SELECT id, destinatario, direccion FROM envios WHERE idempotency_key = $1',
        [idempotency_key]
      );

      if (existing.rows.length > 0) {
        await client.query('COMMIT');
        res.setHeader('X-Instance-ID', INSTANCE_ID);
        // Retorno 200 en lugar de 201 para indicar que ya existía
        return res.status(200).json({
          id: existing.rows[0].id,
          destinatario: existing.rows[0].destinatario,
          direccion: existing.rows[0].direccion,
          duplicado: true
        });
      }
    }

    // Crear nuevo envío
    const newId = uuidv4();

    // Simular demora para prueba de timeout (activar/desactivar con variable de entorno)
    if (process.env.SIMULATE_DELAY === 'true') {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    const result = await client.query(
      `INSERT INTO envios (id, destinatario, direccion, idempotency_key, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, destinatario, direccion`,
      [newId, destinatario, direccion, idempotency_key || null]
    );

    await client.query('COMMIT');

    res.setHeader('X-Instance-ID', INSTANCE_ID);
    return res.status(201).json(result.rows[0]);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en POST /envios:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// GET /health — Verificar conexión a PostgreSQL
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

// GET /envios — Listar todos los envíos (útil para verificación)
app.get('/envios', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, destinatario, direccion, idempotency_key, created_at FROM envios ORDER BY created_at DESC'
    );
    res.setHeader('X-Instance-ID', INSTANCE_ID);
    return res.status(200).json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /intentos — Consultar log de intentos (registro de auditoría)
app.get('/intentos', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM intentos ORDER BY fecha_hora DESC LIMIT 100'
    );
    res.setHeader('X-Instance-ID', INSTANCE_ID);
    return res.status(200).json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[${INSTANCE_ID}] Servidor escuchando en puerto ${PORT}`);
});
