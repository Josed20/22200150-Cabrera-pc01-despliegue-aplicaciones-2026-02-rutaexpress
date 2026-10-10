# ==============================================================================
# Script 3: Prueba de Timeout del Cliente y Recuperación
# Requisitos del PDF:
#   - Solicitud completa el registro en PostgreSQL, pero demora 5s en responder.
#   - Cliente configurado para esperar solo 2 segundos -> experimenta TIMEOUT.
#   - Acreditar que el registro se completó en PostgreSQL ANTES del timeout.
#   - Reintentar solicitud sin demora (otra réplica atiende).
#   - Debe quedar un solo envío registrado en la base de datos.
# ==============================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  PRUEBA 3: TIMEOUT DE CLIENTE Y RECUPERACIÓN             " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$claveIdempotencia = "timeout-test-" + [System.Guid]::NewGuid().ToString()

$body = @{
    destinatario    = "María Perez"
    direccion       = "Av. Javier Prado 2040, San Isidro"
    idempotency_key = $claveIdempotencia
} | ConvertTo-Json

# 1. Activar SIMULATE_DELAY temporalmente en app1
Write-Host "`n[1/4] Activando SIMULATE_DELAY=true en app1..." -ForegroundColor Yellow
$envContent = Get-Content -Path .env -Raw
Set-Content -Path .env -Value ($envContent -replace 'SIMULATE_DELAY=false', 'SIMULATE_DELAY=true')
docker compose up -d app1
Start-Sleep -Seconds 2

# 2. Enviar solicitud con timeout del cliente de 2 segundos
Write-Host "`n[2/4] Enviando solicitud inicial con timeout de cliente = 2 segundos..." -ForegroundColor Yellow
Write-Host "El backend demorará 5s. El cliente cortará a los 2s."
$horaInicio = Get-Date

try {
    # TimeoutSec = 2 simula el cliente que solo espera 2 segundos
    $resp = Invoke-WebRequest -Uri "http://localhost:8080/envios" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 2
    Write-Host "Respuesta inesperada: $($resp.StatusCode)"
} catch {
    $horaTimeout = Get-Date
    $duracion = ($horaTimeout - $horaInicio).TotalSeconds
    Write-Host "CLIENTE RECIBIÓ TIMEOUT tras $($duracion.ToString('0.00')) segundos:" -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
}

# 3. Acreditar que el registro se completó en PostgreSQL antes del timeout
Write-Host "`n[3/4] Acreditando en PostgreSQL que el envío YA FUE REGISTRADO:" -ForegroundColor Yellow
docker compose exec db psql -U enviosuser -d enviosdb -c "SELECT id, destinatario, direccion, idempotency_key, created_at FROM envios WHERE idempotency_key = '$claveIdempotencia';"

# Desactivar SIMULATE_DELAY
Write-Host "`nRestableciendo SIMULATE_DELAY=false en app1..." -ForegroundColor Yellow
$envContent = Get-Content -Path .env -Raw
Set-Content -Path .env -Value ($envContent -replace 'SIMULATE_DELAY=true', 'SIMULATE_DELAY=false')
docker compose up -d app1
Start-Sleep -Seconds 2

# 4. Reintentar con la misma idempotency_key (sin demora)
Write-Host "`n[4/4] Reintentando solicitud con la misma idempotency_key..." -ForegroundColor Yellow
try {
    $respReintento = Invoke-WebRequest -Uri "http://localhost:8080/envios" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
    Write-Host "Reintento respondido con HTTP $($respReintento.StatusCode)" -ForegroundColor Green
    Write-Host "Atendido por réplica: $($respReintento.Headers['X-Instance-ID'])" -ForegroundColor Green
    Write-Host "Cuerpo de respuesta: $($respReintento.Content)"
} catch {
    Write-Host "Error en reintento: $($_.Exception.Message)" -ForegroundColor Red
}

# Verificar conteo final en BD
Write-Host "`nVerificación final en BD: Total de registros con esta clave (DEBE SER 1):" -ForegroundColor Yellow
docker compose exec db psql -U enviosuser -d enviosdb -c "SELECT COUNT(*) as total_envios FROM envios WHERE idempotency_key = '$claveIdempotencia';"

Write-Host "`nPrueba 3 completada exitosamente." -ForegroundColor Cyan
