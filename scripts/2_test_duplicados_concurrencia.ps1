# ==============================================================================
# Script 2: Prueba de Prevención de Duplicados y Concurrencia
# Requisitos del PDF:
#   - Dos intentos simultáneos de registrar el mismo envío, atendidos por réplicas distintas.
#     Debe quedar un solo envío registrado en BD.
#   - Registrar dos envíos nuevos solicitados intencionalmente con el mismo
#     destinatario y dirección. Debe quedar cada uno con su propio ID.
# ==============================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  PRUEBA 2: PREVENCIÓN DE DUPLICADOS Y CONCURRENCIA       " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$claveIdempotencia = "envio-concurrente-" + [System.Guid]::NewGuid().ToString()

$bodyJson = @{
    destinatario    = "Ana Torres"
    direccion       = "Av. Los Olivos 123, Lima"
    idempotency_key = $claveIdempotencia
} | ConvertTo-Json

Write-Host "`n[1/2] Enviando 2 solicitudes SIMULTÁNEAS con la misma idempotency_key..." -ForegroundColor Yellow
Write-Host "Clave usada: $claveIdempotencia"

# Ejecutar 2 peticiones paralelas en segundo plano
$job1 = Start-Job -ScriptBlock {
    param($body)
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:8080/envios" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10
        [PSCustomObject]@{
            Status   = $resp.StatusCode
            Instance = $resp.Headers['X-Instance-ID']
            Content  = $resp.Content
        }
    } catch {
        [PSCustomObject]@{ Status = $_.Exception.Response.StatusCode.value__; Error = $_.Exception.Message }
    }
} -ArgumentList $bodyJson

$job2 = Start-Job -ScriptBlock {
    param($body)
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:8080/envios" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10
        [PSCustomObject]@{
            Status   = $resp.StatusCode
            Instance = $resp.Headers['X-Instance-ID']
            Content  = $resp.Content
        }
    } catch {
        [PSCustomObject]@{ Status = $_.Exception.Response.StatusCode.value__; Error = $_.Exception.Message }
    }
} -ArgumentList $bodyJson

$res1 = Receive-Job -Job $job1 -Wait
$res2 = Receive-Job -Job $job2 -Wait
Remove-Job $job1, $job2

Write-Host "`nResultado Petición 1: Status $($res1.Status) | Replica: $($res1.Instance)" -ForegroundColor Green
Write-Host "Respuesta 1: $($res1.Content)"
Write-Host "`nResultado Petición 2: Status $($res2.Status) | Replica: $($res2.Instance)" -ForegroundColor Green
Write-Host "Respuesta 2: $($res2.Content)"

# Verificar en PostgreSQL que existe un único envío
Write-Host "`nVerificando en PostgreSQL (debe haber 1 solo envío con esta clave)..." -ForegroundColor Yellow
docker compose exec db psql -U enviosuser -d enviosdb -c "SELECT id, destinatario, direccion, idempotency_key, created_at FROM envios WHERE idempotency_key = '$claveIdempotencia';"

# 2. Dos envíos intencionales con mismo destinatario y dirección
Write-Host "`n[2/2] Registrando 2 envíos NUEVOS INTENCIONALES con mismo destinatario y dirección..." -ForegroundColor Yellow

$envioNuevo1 = @{
    destinatario    = "Carlos Gomez"
    direccion       = "Jr. Ayacucho 456, Trujillo"
    idempotency_key = "pedido-intencional-A-" + [System.Guid]::NewGuid().ToString()
} | ConvertTo-Json

$envioNuevo2 = @{
    destinatario    = "Carlos Gomez"
    direccion       = "Jr. Ayacucho 456, Trujillo"
    idempotency_key = "pedido-intencional-B-" + [System.Guid]::NewGuid().ToString()
} | ConvertTo-Json

$respNuevo1 = Invoke-RestMethod -Uri "http://localhost:8080/envios" -Method Post -Body $envioNuevo1 -ContentType "application/json"
Write-Host "Envío Intencional 1 Creado: ID = $($respNuevo1.id) (HTTP 201)" -ForegroundColor Green

$respNuevo2 = Invoke-RestMethod -Uri "http://localhost:8080/envios" -Method Post -Body $envioNuevo2 -ContentType "application/json"
Write-Host "Envío Intencional 2 Creado: ID = $($respNuevo2.id) (HTTP 201)" -ForegroundColor Green

Write-Host "`nVerificando ambos envíos intencionales en la base de datos:" -ForegroundColor Yellow
docker compose exec db psql -U enviosuser -d enviosdb -c "SELECT id, destinatario, direccion, idempotency_key FROM envios WHERE destinatario = 'Carlos Gomez';"

Write-Host "`nPrueba 2 completada exitosamente." -ForegroundColor Cyan
