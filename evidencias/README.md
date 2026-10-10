# 📸 Índice de Evidencias — PC01 RutaExpress

Este directorio contiene las capturas de pantalla de las pruebas requeridas para la **PC01 de Despliegue de Aplicaciones**.

---

### 1. Balanceo de Carga y Continuidad del Servicio
* **`balanceoycontinuidad1.png`**: Registro de al menos 9 solicitudes exitosas a `/health` mostrando la distribución round-robin entre las tres instancias (`app1`, `app2`, `app3`).
* **`balanceoycontinidad2.png`**: Detención de `app2` demostrando continuidad del servicio con `app1` y `app3`, registro de transición y restablecimiento de `app2`.

---

### 2. Concurrencia y Prevención de Duplicados
* **`duplicadosYconcurrencia1.png`**: Dos solicitudes simultáneas a réplicas distintas con la misma `idempotency_key` (una responde HTTP 201 y la otra HTTP 200 con `duplicado: true`).
* **`duplicacosyconcurrencia2.png`**: Verificación en PostgreSQL demostrando que existe un solo envío registrado para esa operación.
* **`duplicadosyconcurrencia3.png`**: Registro exitoso de dos envíos nuevos solicitados intencionalmente con el mismo destinatario y dirección, comprobando IDs distintos.

---

### 3. Prueba de Timeout y Recuperación
* **`demorayrecuperación.png`**:
  1. Activación de demora y solicitud inicial donde el cliente experimenta timeout (2 segundos).
  2. Acreditación de que el registro en PostgreSQL se completó antes del timeout.
  3. Reintento atendido por otra réplica sin generar un segundo envío (un solo registro final).

---

### 4. Control de Tráfico — Rate Limiting (HTTP 429)
* **`ratelimit429.png`**: Ráfaga de solicitudes sobre `POST /envios` generando rechazos HTTP 429 por límite de velocidad (2 req/s + ráfaga de 4), conteo de códigos, duración y posterior admisión tras el cooldown.

---

### 5. Persistencia y Recreación de Contenedores
* **`Persistencia tras recrear contenedores.png`**:
  1. Registro de 3 envíos distintos.
  2. Recreación de contenedores (`docker compose down` y `docker compose up -d`).
  3. Verificación de que permanecen los mismos IDs y datos.
  4. Reintento de operación previa demostrando que no se crea duplicado.

---

### 6. Inspección en Base de Datos (DBeaver)
* **`Tabla de envíos.png`**: Consulta en DBeaver conectada a `localhost:15432` mostrando la tabla `envios` con los registros generados y sus claves de idempotencia.
* **`Tabla de auditoría de intentos.png`**: Consulta en DBeaver mostrando la tabla `intentos` con el registro cronológico y persistente de cada solicitud (método, ruta, instancia, resultado y código HTTP).
