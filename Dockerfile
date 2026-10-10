# syntax=docker/dockerfile:1

# ── Etapa base ──────────────────────────────────────────────
FROM node:20-alpine AS base

# Instalar dependencias de sistema necesarias
RUN apk add --no-cache dumb-init

# Crear directorio de trabajo
WORKDIR /app

# ── Etapa de dependencias ────────────────────────────────────
FROM base AS deps

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ── Etapa de producción ──────────────────────────────────────
FROM base AS production

# Crear usuario no-root para ejecutar la aplicación
RUN addgroup -g 1001 -S appgroup && \
    adduser  -u 1001 -S appuser -G appgroup

WORKDIR /app

# Copiar dependencias instaladas desde la etapa anterior
COPY --from=deps --chown=appuser:appgroup /app/node_modules ./node_modules

# Copiar código fuente
COPY --chown=appuser:appgroup package.json ./
COPY --chown=appuser:appgroup src/ ./src/

# Cambiar al usuario no-root
USER appuser

# Puerto expuesto (interno, no publicado al host directamente)
EXPOSE 3000

# Usar dumb-init como entrypoint para manejo correcto de señales
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
