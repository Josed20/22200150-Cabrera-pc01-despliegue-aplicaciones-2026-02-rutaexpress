-- ============================================================
-- Script de inicialización de base de datos para envios-app
-- RutaExpress - PC01 Despliegue de Aplicaciones
-- ============================================================

-- Tabla principal de envíos
CREATE TABLE IF NOT EXISTS envios (
    id               UUID PRIMARY KEY,
    destinatario     TEXT NOT NULL,
    direccion        TEXT NOT NULL,
    idempotency_key  TEXT UNIQUE,          -- clave de idempotencia (previene duplicados)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para búsqueda rápida por idempotency_key
CREATE INDEX IF NOT EXISTS idx_envios_idempotency ON envios(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Tabla de registro de intentos (auditoría completa y persistente)
CREATE TABLE IF NOT EXISTS intentos (
    id              UUID PRIMARY KEY,
    fecha_hora      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metodo          TEXT NOT NULL,              -- GET, POST, etc.
    ruta            TEXT NOT NULL,              -- /envios, /health, etc.
    instancia       TEXT NOT NULL,              -- app1, app2, app3
    resultado       TEXT NOT NULL,              -- ACEPTADO | REINTENTO_DUPLICADO | RECHAZADO | ERROR
    envio_id        UUID REFERENCES envios(id), -- ID del envío relacionado (si aplica)
    idempotency_key TEXT,                       -- clave para relacionar intentos de un mismo envío
    cliente_ip      TEXT,                       -- IP de origen
    http_code       INTEGER                     -- Código HTTP de respuesta
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_intentos_envio_id ON intentos(envio_id);
CREATE INDEX IF NOT EXISTS idx_intentos_idempotency ON intentos(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_intentos_fecha ON intentos(fecha_hora DESC);
