-- ============================================================
-- Script de inicialización de base de datos para envios-app
-- RutaExpress - PC01 Despliegue de Aplicaciones
-- ============================================================

-- Tabla principal de envíos
CREATE TABLE IF NOT EXISTS envios (
    id               UUID PRIMARY KEY,
    destinatario     TEXT NOT NULL,
    direccion        TEXT NOT NULL,
    idempotency_key  TEXT UNIQUE,          -- clave de idempotencia opcional (previene duplicados)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para búsqueda rápida por idempotency_key
CREATE INDEX IF NOT EXISTS idx_envios_idempotency ON envios(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Tabla de registro de intentos (auditoría completa)
CREATE TABLE IF NOT EXISTS intentos (
    id          UUID PRIMARY KEY,
    fecha_hora  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metodo      TEXT NOT NULL,              -- HTTP method (GET, POST, etc.)
    ruta        TEXT NOT NULL,              -- endpoint path
    instancia   TEXT,                       -- replica que atendió la solicitud
    resultado   TEXT,                       -- ACEPTADO | DUPLICADO | RECHAZADO | ERROR
    envio_id    UUID REFERENCES envios(id), -- envío relacionado (si aplica)
    http_code   INTEGER                     -- código HTTP de la respuesta
);

-- Índice para búsqueda por envío relacionado
CREATE INDEX IF NOT EXISTS idx_intentos_envio_id ON intentos(envio_id);
-- Índice para ordenar por fecha
CREATE INDEX IF NOT EXISTS idx_intentos_fecha ON intentos(fecha_hora DESC);
