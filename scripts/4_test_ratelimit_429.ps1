# ==============================================================================
# Script 4: Prueba de Rate Limiting (HTTP 429) y Logs de Rechazos
# Requisitos del PDF:
#   - Límite de 2 req/s por IP sobre POST /envios.
#   - Ráfaga de 4 solicitudes procesadas de inmediato.
#   - Rechazo con HTTP 429.
#   - Registrar cantidad de solicitudes, duración y conteo de códigos HTTP.
#   - Tras reducir la frecuencia, comprobar que se admiten nuevas solicitudes.
#   - Comprobar que los logs de Nginx registran los 429 de forma persistente.
# ==============================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  PRUEBA 4: RATE LIMITING (HTTP 429) EN NGINX            " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$totalSolicitudes = 12
$conteoCodigos = @{}
$inicio = Get-Date

Write-Host "`n[1/3] Generando ráfaga rápida de $totalSolicitudes solicitudes POST a /envios..." -ForegroundColor Yellow

for ($i = 1; $i -le $totalSolicitudes; $i++) {
    $body = @{
        destinatario    = "Cliente Ráfaga $i"
        direccion       = "Av. Arequipa 500, Lima"
        idempotency_key = "burst-" + [System.Guid]::NewGuid().ToString()
    } | ConvertTo-Json

    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:8080/envios" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 3
        $code = $resp.StatusCode.ToString()
        if (-not $conteoCodigos.ContainsKey($code)) { $conteoCodigos[$code] = 0 }
        $conteoCodigos[$code]++
        Write-Host "  Solicitud $i : HTTP $code (Aceptada)" -ForegroundColor Green
    } catch {
        $code = $_.Exception.Response.StatusCode.value__.ToString()
        if (-not $conteoCodigos.ContainsKey($code)) { $conteoCodigos[$code] = 0 }
        $conteoCodigos[$code]++
        if ($code -eq "429") {
            Write-Host "  Solicitud $i : HTTP 429 Too Many Requests (Rechazada por Nginx)" -ForegroundColor Magenta
        } else {
            Write-Host "  Solicitud $i : HTTP $code ($($_.Exception.Message))" -ForegroundColor Red
        }
    }
}

$fin = Get-Date
$duracion = ($fin - $inicio).TotalSeconds

Write-Host "`n--- RESULTADOS DE LA RÁFAGA ---" -ForegroundColor Cyan
Write-Host "Total de solicitudes enviadas: $totalSolicitudes"
Write-Host "Duración total de la ráfaga:   $($duracion.ToString('0.00')) segundos"
Write-Host "Conteo de códigos HTTP:"
$conteoCodigos.GetEnumerator() | ForEach-Object {
    Write-Host "  HTTP $($_.Key): $($_.Value) respuestas"
}

# 2. Reducir frecuencia y comprobar que se admiten nuevas solicitudes
Write-Host "`n[2/3] Esperando 3 segundos para que se disipe la ráfaga..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

Write-Host "Enviando nueva solicitud a menor frecuencia..." -ForegroundColor Yellow
$bodyPostCooldown = @{
    destinatario    = "Cliente Post Cooldown"
    direccion       = "Av. Larco 100, Miraflores"
    idempotency_key = "cooldown-" + [System.Guid]::NewGuid().ToString()
} | ConvertTo-Json

try {
    $respCool = Invoke-WebRequest -Uri "http://localhost:8080/envios" -Method Post -Body $bodyPostCooldown -ContentType "application/json" -TimeoutSec 3
    Write-Host "Solicitud tras cooldown: HTTP $($respCool.StatusCode) (Admitida exitosamente)" -ForegroundColor Green
} catch {
    Write-Host "Solicitud tras cooldown falló: $($_.Exception.Message)" -ForegroundColor Red
}

# 3. Consultar logs de Nginx demostrando el registro de HTTP 429
Write-Host "`n[3/3] Consultando registros de auditoría en Nginx (/var/log/nginx/access.log)..." -ForegroundColor Yellow
Write-Host "Buscando rechazos HTTP 429 registrados antes de llegar a la aplicación:" -ForegroundColor Yellow
docker compose exec nginx cat /var/log/nginx/access.log | Select-String "status=429" | Select-Object -Last 10

Write-Host "`nPrueba 4 completada exitosamente." -ForegroundColor Cyan
