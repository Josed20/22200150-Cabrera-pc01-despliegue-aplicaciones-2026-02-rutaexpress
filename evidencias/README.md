# Evidencias de pruebas — envios-app RutaExpress

Esta carpeta contiene las capturas de pantalla, registros y evidencias requeridas para la PC01.

## Evidencias a incluir

### 1. Contenerización
- [ ] Captura de `docker build` exitoso
- [ ] Captura de `docker push` a Docker Hub
- [ ] Captura de `docker pull` (descarga de imagen)
- [ ] Imagen visible en Docker Hub con tag de versión

### 2. Servicios del despliegue
- [ ] Captura de `docker compose up -d` con los 5 servicios corriendo
- [ ] Captura de `docker compose ps` mostrando estado de cada servicio

### 3. Balanceo de carga
- [ ] 9+ solicitudes GET /health con respuestas de app1, app2 y app3
- [ ] Captura de detención de app2 (`docker compose stop app2`)
- [ ] Solicitudes exitosas durante la baja de app2 (solo app1 y app3)
- [ ] Restablecimiento de app2 y verificación de que vuelve a recibir solicitudes

### 4. Prevención de duplicados
- [ ] POST /envios exitoso (201) con idempotency_key
- [ ] Mismo POST repetido → respuesta 200 con `"duplicado": true`
- [ ] Dos solicitudes simultáneas a réplicas distintas → un solo envío en BD
- [ ] Dos envíos nuevos (sin idempotency_key o clave diferente) mismo destinatario → dos registros distintos

### 5. Prueba de timeout
- [ ] POST /envios con SIMULATE_DELAY=true → cliente recibe timeout (2s)
- [ ] Consulta a PostgreSQL mostrando que el envío se registró antes del timeout
- [ ] Reintento desde otra réplica → no crea un segundo envío
- [ ] Consulta final mostrando un solo registro en la BD

### 6. Persistencia
- [ ] 3+ envíos en DBeaver antes de recrear contenedores
- [ ] `docker compose down` + `docker compose up -d`
- [ ] DBeaver mostrando los mismos IDs y datos después de recrear
- [ ] Reintento de operación ya completada → no crea duplicado

### 7. HTTP 429 y Rate Limiting
- [ ] Carga de solicitudes produciendo rechazos 429
- [ ] Conteo de solicitudes, duración y códigos HTTP
- [ ] Después de reducir frecuencia → nuevas solicitudes aceptadas
- [ ] Logs de Nginx con registros de los 429 (fecha, IP, método, ruta, código)
- [ ] Logs persisten después de recrear el contenedor nginx

### 8. Registro de intentos
- [ ] Consulta a GET /intentos mostrando el log de auditoría
- [ ] Intentos persisten al recrear contenedores de la app
