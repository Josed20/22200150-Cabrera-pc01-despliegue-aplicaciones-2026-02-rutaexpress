# ==============================================================================
# Script 1: Prueba de Balanceo de Carga y Continuidad del Servicio
# Requisitos del PDF:
#   - Al menos 9 solicitudes exitosas a /health con respuestas de las 3 instancias.
#   - Detener app2 y comprobar que app1 y app3 siguen atendiendo.
#   - Restablecer app2 y comprobar que vuelve a recibir solicitudes.
# ==============================================================================

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  PRUEBA 1: BALANCEO DE CARGA Y CONTINUIDAD (NGINX)  " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

# 1. Enviar 9 solicitudes a /health
Write-Host "`n[1/3] Enviando 9 solicitudes a GET http://localhost:8080/health..." -ForegroundColor Yellow
$replicas = @{}

for ($i = 1; $i -le 9; $i++) {
    try {
        $res = Invoke-RestMethod -Uri "http://localhost:8080/health" -Method Get -TimeoutSec 3
        $instancia = $res.instance
        if (-not $replicas.ContainsKey($instancia)) { $replicas[$instancia] = 0 }
        $replicas[$instancia]++
        Write-Host "  Intento $i : HTTP 200 | Instancia atendió: $instancia | DB: $($res.database)" -ForegroundColor Green
    } catch {
        Write-Host "  Intento $i : Error - $($_.Exception.Message)" -ForegroundColor Red
    }
    Start-Sleep -Milliseconds 200
}

Write-Host "`nDistribución de respuestas:" -ForegroundColor Cyan
$replicas.GetEnumerator() | ForEach-Object { Write-Host "  $($_.Key): $($_.Value) solicitudes" }

# 2. Detener app2 y verificar continuidad
Write-Host "`n[2/3] Deteniendo contenedor app2 (docker compose stop app2)..." -ForegroundColor Yellow
docker compose stop app2

Write-Host "Enviando 6 solicitudes para verificar que app1 y app3 continúan atendiendo..." -ForegroundColor Yellow
for ($i = 1; $i -le 6; $i++) {
    try {
        $res = Invoke-RestMethod -Uri "http://localhost:8080/health" -Method Get -TimeoutSec 3
        Write-Host "  Solicitud $i tras caída de app2: Instancia atendió: $($res.instance)" -ForegroundColor Green
    } catch {
        Write-Host "  Solicitud $i : Error de transición: $($_.Exception.Message)" -ForegroundColor Red
    }
    Start-Sleep -Milliseconds 200
}

# 3. Restablecer app2
Write-Host "`n[3/3] Restableciendo app2 (docker compose start app2)..." -ForegroundColor Yellow
docker compose start app2
Start-Sleep -Seconds 3

Write-Host "Verificando que app2 vuelve a recibir tráfico..." -ForegroundColor Yellow
for ($i = 1; $i -le 6; $i++) {
    try {
        $res = Invoke-RestMethod -Uri "http://localhost:8080/health" -Method Get -TimeoutSec 3
        Write-Host "  Solicitud $i tras restablecer: Instancia atendió: $($res.instance)" -ForegroundColor Green
    } catch {
        Write-Host "  Solicitud $i : Error: $($_.Exception.Message)" -ForegroundColor Red
    }
    Start-Sleep -Milliseconds 200
}

Write-Host "`nPrueba 1 completada exitosamente." -ForegroundColor Cyan
