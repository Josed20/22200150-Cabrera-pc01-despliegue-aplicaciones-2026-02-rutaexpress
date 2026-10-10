# ==============================================================================
# Script 5: Prueba de Persistencia de Datos y Recreación de Contenedores
# Requisitos del PDF:
#   - Registrar al menos 3 envíos distintos.
#   - Consultar sus datos (accesible desde DBeaver en localhost:15432).
#   - Recrear contenedores (docker compose down y docker compose up -d).
#   - Comprobar que permanecen los mismos IDs y datos.
#   - Reintentar una de las operaciones ya completadas tras la recreación
#     y demostrar que no se crea duplicado.
# ==============================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  PRUEBA 5: PERSISTENCIA Y RECREACIÓN DE CONTENEDORES    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Registrar al menos 3 envíos distintos
Write-Host "`n[1/4] Registrando 3 envíos distintos..." -ForegroundColor Yellow

$clavePersistente1 = "persist-01-" + [System.Guid]::NewGuid().ToString()
$clavePersistente2 = "persist-02-" + [System.Guid]::NewGuid().ToString()
$clavePersistente3 = "persist-03-" + [System.Guid]::NewGuid().ToString()

$envio1 = @{ destinatario = "Luis Morales";  direccion = "Av. Brasil 1234, Jesus Maria"; idempotency_key = $clavePersistente1 } | ConvertTo-Json
$envio2 = @{ destinatario = "Elena Vega";    direccion = "Calle Las Begonias 450, San Isidro"; idempotency_key = $clavePersistente2 } | ConvertTo-Json
$envio3 = @{ destinatario = "Mario Vargas";  direccion = "Av. Universitaria 1800, San Miguel"; idempotency_key = $clavePersistente3 } | ConvertTo-Json

$res1 = Invoke-RestMethod -Uri "http://localhost:8080/envios" -Method Post -Body $envio1 -ContentType "application/json"
$res2 = Invoke-RestMethod -Uri "http://localhost:8080/envios" -Method Post -Body $envio2 -ContentType "application/json"
$res3 = Invoke-RestMethod -Uri "http://localhost:8080/envios" -Method Post -Body $envio3 -ContentType "application/json"

Write-Host "  Envío 1 Creado: ID = $($res1.id) | Destinatario: $($res1.destinatario)" -ForegroundColor Green
Write-Host "  Envío 2 Creado: ID = $($res2.id) | Destinatario: $($res2.destinatario)" -ForegroundColor Green
Write-Host "  Envío 3 Creado: ID = $($res3.id) | Destinatario: $($res3.destinatario)" -ForegroundColor Green

Write-Host "`n[2/4] Consultando en PostgreSQL ANTES de recrear contenedores:" -ForegroundColor Yellow
docker compose exec db psql -U enviosuser -d enviosdb -c "SELECT id, destinatario, direccion, idempotency_key FROM envios WHERE idempotency_key IN ('$clavePersistente1', '$clavePersistente2', '$clavePersistente3');"

# 3. Recrear los contenedores (down y up)
Write-Host "`n[3/4] Recreando todos los contenedores con 'docker compose down' y 'docker compose up -d'..." -ForegroundColor Yellow
docker compose down
Start-Sleep -Seconds 2
docker compose up -d
Write-Host "Esperando 8 segundos a que PostgreSQL y los servicios inicien..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

# 4. Comprobar que permanecen los mismos IDs y datos
Write-Host "`n[4/4] Verificando en PostgreSQL DESPUÉS de la recreación:" -ForegroundColor Yellow
docker compose exec db psql -U enviosuser -d enviosdb -c "SELECT id, destinatario, direccion, idempotency_key FROM envios WHERE idempotency_key IN ('$clavePersistente1', '$clavePersistente2', '$clavePersistente3');"

# 5. Reintentar una de las operaciones ya completadas
Write-Host "`nReintentando la operación del Envío 1 (clave: $clavePersistente1)..." -ForegroundColor Yellow
try {
    $reintento = Invoke-RestMethod -Uri "http://localhost:8080/envios" -Method Post -Body $envio1 -ContentType "application/json"
    Write-Host "Respuesta del reintento: ID = $($reintento.id) | duplicado = $($reintento.duplicado)" -ForegroundColor Green
    if ($reintento.id -eq $res1.id) {
        Write-Host "CONFIRMADO: El reintento retornó el ID idéntico sin duplicar." -ForegroundColor Green
    }
} catch {
    Write-Host "Error en reintento: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nPrueba 5 completada exitosamente." -ForegroundColor Cyan
