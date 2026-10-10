# envios-app — RutaExpress PC01 Despliegue de Aplicaciones

API REST para registro de envíos con prevención de duplicados, balanceo de carga y control de tráfico.

## Stack tecnológico

| Componente | Tecnología |
|---|---|
| Backend | Node.js 20 + Express |
| Base de datos | PostgreSQL 16 |
| Proxy / LB | Nginx 1.25 |
| Contenedores | Docker + Docker Compose |

## Estructura del proyecto

```
envios-app/
├── src/
│   └── index.js           # Aplicación Express
├── db/
│   └── init.sql           # Schema de base de datos
├── nginx/
│   └── nginx.conf         # Configuración Nginx (LB + rate limiting)
├── evidencias/            # Capturas de pantalla y registros de pruebas
├── respuestas-analisis/   # Respuestas a las preguntas de análisis
├── Dockerfile             # Imagen multi-etapa (usuario no-root)
├── .dockerignore
├── .env.example           # Variables requeridas (sin secretos)
├── .gitignore
├── docker-compose.yml     # Servicios: app1, app2, app3, db, nginx
└── package.json
```

## Requisitos previos

- Docker Desktop instalado y en ejecución
- (Opcional) DBeaver para inspeccionar la BD

## Configuración inicial

```bash
# 1. Clonar el repositorio
git clone https://github.com/Josed20/22200150-Cabrera-pc01-despliegue-aplicaciones-2026-02-rutaexpress.git
cd 22200150-Cabrera-pc01-despliegue-aplicaciones-2026-02-rutaexpress/envios-app

# 2. Crear archivo .env a partir del ejemplo
cp .env.example .env
# Editar .env y reemplazar REEMPLAZA_CON_TU_PASSWORD con una contraseña real
```

## Imagen en Docker Hub (Publicada)

- **Repositorio Docker Hub**: [https://hub.docker.com/r/josed20/envios-app](https://hub.docker.com/r/josed20/envios-app)
- **Imagen versionada**: `josed20/envios-app:1.0.0`

```bash
# Descarga de la imagen oficial (como requiere la práctica)
docker pull josed20/envios-app:1.0.0
```

# Para usar la imagen publicada, actualizar .env:
# DOCKER_IMAGE=tu-usuario-dockerhub/envios-app:1.0.0
```

## Levantar los servicios

```bash
docker compose up -d
```

Servicios que se inician:
- **nginx** → `localhost:8080` (punto de entrada público)
- **db** → `localhost:15432` (acceso DBeaver)
- **app1, app2, app3** → puerto 3000 interno (solo vía Nginx)

## Endpoints disponibles

### `POST /envios`
Registra un nuevo envío.

```json
{
  "destinatario": "Ana Torres",
  "direccion": "Av. Los Olivos 123, Lima",
  "idempotency_key": "clave-unica-opcional"
}
```

- `destinatario` y `direccion` son **obligatorios**.
- `idempotency_key` es **opcional**. Si se incluye, solicitudes repetidas con la misma clave retornan el envío original sin crear uno nuevo.
- La respuesta incluye la cabecera `X-Instance-ID` con la réplica que atendió.

**Respuestas:**
- `201 Created` — envío registrado exitosamente
- `200 OK` — solicitud duplicada detectada (con `"duplicado": true`)
- `400 Bad Request` — campos faltantes o inválidos
- `429 Too Many Requests` — límite de velocidad excedido (desde Nginx)

### `GET /health`
Comprueba la conexión a PostgreSQL.

```json
{
  "status": "ok",
  "database": "connected",
  "instance": "app1",
  "timestamp": "2026-10-10T11:00:00.000Z"
}
```

### `GET /envios`
Lista todos los envíos registrados.

### `GET /intentos`
Consulta el registro de intentos (auditoría).

## Prevención de duplicados

La solución usa una columna `idempotency_key` con restricción `UNIQUE` en la tabla `envios`.

- **Reintento**: enviar la misma `idempotency_key` → retorna el envío existente (sin duplicar).
- **Nuevo envío intencional**: omitir `idempotency_key` o usar una clave diferente → crea un envío nuevo aunque `destinatario` y `direccion` sean iguales.

Esto distingue claramente un *reintento* (misma clave) de una *nueva operación* (sin clave o clave diferente).

## Rate Limiting (Nginx)

- **Límite**: 2 solicitudes/segundo por IP en `POST /envios`
- **Ráfaga**: 4 solicitudes adicionales procesadas de inmediato
- **Rechazo**: HTTP 429 cuando se supera el límite

Los rechazos quedan registrados en `/var/log/nginx/access.log` (volumen persistente `nginx_logs`).

```bash
# Consultar logs de Nginx (incluye 429)
docker exec rutaexpress_nginx cat /var/log/nginx/access.log
```

## Prueba de timeout y recuperación

Para simular demora en `POST /envios`:

```bash
# 1. Activar demora (5 segundos) en el .env:
SIMULATE_DELAY=true
docker compose up -d --no-deps app1  # recrear solo app1

# 2. Enviar solicitud con timeout de 2 segundos desde Postman:
#    Settings > Request timeout: 2000 ms

# 3. Verificar que el envío se registró antes del timeout:
docker exec rutaexpress_db psql -U enviosuser -d enviosdb -c "SELECT * FROM envios;"

# 4. Desactivar demora:
SIMULATE_DELAY=false
docker compose up -d --no-deps app1

# 5. Reintentar con la misma idempotency_key → no debe crear un segundo envío
```

## Persistencia de datos

Los datos de PostgreSQL se almacenan en el volumen Docker `postgres_data`.  
Al recrear los contenedores, los datos permanecen:

```bash
docker compose down          # detiene y elimina contenedores (NO los volúmenes)
docker compose up -d         # reinicia; los datos siguen disponibles
```

Para eliminar también los datos:
```bash
docker compose down -v       # elimina contenedores Y volúmenes
```

## Acceso a PostgreSQL desde DBeaver

| Campo | Valor |
|---|---|
| Host | `localhost` |
| Puerto | `15432` |
| Base de datos | `enviosdb` |
| Usuario | `enviosuser` |
| Contraseña | (la del .env) |

## Verificar balanceo de carga

```bash
# Enviar 9 solicitudes GET /health y verificar que responden las 3 réplicas
for i in {1..9}; do curl -s http://localhost:8080/health | python -m json.tool; done
```

## Detener servicios

```bash
docker compose down          # detiene contenedores (conserva volúmenes)
docker compose down -v       # detiene y elimina volúmenes (borra datos)
```
