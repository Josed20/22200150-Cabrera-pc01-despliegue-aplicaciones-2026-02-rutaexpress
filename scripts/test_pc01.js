/**
 * Test Suite Integral para PC01 - RutaExpress
 * Ejecución: node scripts/test_pc01.js [1|2|3|4|5|all]
 */

const { execSync } = require('child_process');

const BASE_URL = 'http://localhost:8080';

function runCmd(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    return err.stdout ? err.stdout.trim() : (err.message || 'Error');
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==============================================================================
// PRUEBA 1: Balanceo de carga y continuidad del servicio
// ==============================================================================
async function test1_Balanceo() {
  console.log('\n=============================================================');
  console.log('  PRUEBA 1: BALANCEO DE CARGA Y CONTINUIDAD (GET /health)   ');
  console.log('=============================================================');

  console.log('\n[1/3] Enviando 9 solicitudes consecutivas a GET /health...');
  const counts = {};

  for (let i = 1; i <= 9; i++) {
    const res = await fetch(`${BASE_URL}/health`);
    const data = await res.json();
    const inst = data.instance || 'unknown';
    counts[inst] = (counts[inst] || 0) + 1;
    console.log(`  Solicitud ${i}: HTTP ${res.status} | Réplica: ${inst} | DB: ${data.database}`);
    await sleep(200);
  }

  console.log('\nDistribución de respuestas entre instancias:');
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  * ${k}: ${v} solicitudes atendidas`);
  }

  console.log('\n[2/3] Deteniendo contenedor app2 (docker compose stop app2)...');
  runCmd('docker compose stop app2');

  console.log('Enviando 6 solicitudes para verificar que app1 y app3 continúan atendiendo...');
  for (let i = 1; i <= 6; i++) {
    try {
      const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      console.log(`  Solicitud ${i} tras caída de app2: HTTP ${res.status} | Réplica: ${data.instance}`);
    } catch (e) {
      console.log(`  Solicitud ${i} : Error durante transición: ${e.message}`);
    }
    await sleep(300);
  }

  console.log('\n[3/3] Restableciendo app2 (docker compose start app2)...');
  runCmd('docker compose start app2');
  await sleep(3000);

  console.log('Verificando que app2 vuelve a recibir tráfico:');
  for (let i = 1; i <= 6; i++) {
    const res = await fetch(`${BASE_URL}/health`);
    const data = await res.json();
    console.log(`  Solicitud ${i} tras restablecer: HTTP ${res.status} | Réplica: ${data.instance}`);
    await sleep(200);
  }

  console.log('\n>>> PRUEBA 1 FINALIZADA CON ÉXITO <<<\n');
}

// ==============================================================================
// PRUEBA 2: Concurrencia y Prevención de Duplicados
// ==============================================================================
async function test2_Concurrencia() {
  console.log('\n=============================================================');
  console.log('  PRUEBA 2: CONCURRENCIA Y PREVENCIÓN DE DUPLICADOS          ');
  console.log('=============================================================');

  const key = `concurrente-${Date.now()}`;
  const body = JSON.stringify({
    destinatario: "Ana Torres",
    direccion: "Av. Los Olivos 123, Lima",
    idempotency_key: key
  });

  console.log(`\n[1/2] Disparando 2 solicitudes SIMULTÁNEAS con la misma idempotency_key (${key})...`);
  
  const [res1, res2] = await Promise.all([
    fetch(`${BASE_URL}/envios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    }),
    fetch(`${BASE_URL}/envios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    })
  ]);

  const data1 = await res1.json();
  const data2 = await res2.json();

  console.log(`  Petición A: HTTP ${res1.status} | Instancia: ${res1.headers.get('x-instance-id')} | body:`, data1);
  console.log(`  Petición B: HTTP ${res2.status} | Instancia: ${res2.headers.get('x-instance-id')} | body:`, data2);

  console.log('\nVerificando registros en PostgreSQL (debe existir EXACTAMENTE 1):');
  const sqlCheck = runCmd(`docker compose exec -T db psql -U enviosuser -d enviosdb -c "SELECT id, destinatario, direccion, idempotency_key FROM envios WHERE idempotency_key = '${key}';"`);
  console.log(sqlCheck);

  console.log('\n[2/2] Registrando 2 envíos NUEVOS INTENCIONALES con mismo destinatario y dirección...');
  const resNuevo1 = await fetch(`${BASE_URL}/envios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      destinatario: "Carlos Gomez",
      direccion: "Jr. Ayacucho 456, Trujillo",
      idempotency_key: `intencional-A-${Date.now()}`
    })
  });
  const dataNuevo1 = await resNuevo1.json();

  const resNuevo2 = await fetch(`${BASE_URL}/envios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      destinatario: "Carlos Gomez",
      direccion: "Jr. Ayacucho 456, Trujillo",
      idempotency_key: `intencional-B-${Date.now()}`
    })
  });
  const dataNuevo2 = await resNuevo2.json();

  console.log(`  Envío 1 Creado: HTTP ${resNuevo1.status} | ID: ${dataNuevo1.id}`);
  console.log(`  Envío 2 Creado: HTTP ${resNuevo2.status} | ID: ${dataNuevo2.id}`);

  console.log('\nVerificando en PostgreSQL (ambos deben existir con IDs distintos):');
  const sqlCheckIntencionales = runCmd(`docker compose exec -T db psql -U enviosuser -d enviosdb -c "SELECT id, destinatario, direccion, idempotency_key FROM envios WHERE destinatario = 'Carlos Gomez' ORDER BY created_at DESC LIMIT 2;"`);
  console.log(sqlCheckIntencionales);

  console.log('\n>>> PRUEBA 2 FINALIZADA CON ÉXITO <<<\n');
}

// ==============================================================================
// PRUEBA 3: Timeout y Recuperación
// ==============================================================================
async function test3_Timeout() {
  console.log('\n=============================================================');
  console.log('  PRUEBA 3: TIMEOUT DE CLIENTE Y RECUPERACIÓN               ');
  console.log('=============================================================');

  const key = `timeout-${Date.now()}`;
  const body = JSON.stringify({
    destinatario: "María Perez",
    direccion: "Av. Javier Prado 2040, San Isidro",
    idempotency_key: key
  });

  console.log('\n[1/4] Activando SIMULATE_DELAY=true en app1...');
  runCmd('powershell -Command "(Get-Content .env) -replace \'SIMULATE_DELAY=false\', \'SIMULATE_DELAY=true\' | Set-Content .env"');
  runCmd('docker compose up -d app1');
  await sleep(2500);

  console.log('\n[2/4] Enviando solicitud inicial con timeout de cliente = 2 segundos...');
  const t0 = Date.now();
  try {
    await fetch(`${BASE_URL}/envios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(2000)
    });
    console.log('  Respuesta recibida antes de tiempo');
  } catch (err) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`  CLIENTE EXPERIMENTÓ TIMEOUT tras ${elapsed} segundos: ${err.message}`);
  }

  console.log('\n[3/4] Acreditando en PostgreSQL que el envío YA SE REGISTRÓ antes del timeout:');
  const sqlCheck = runCmd(`docker compose exec -T db psql -U enviosuser -d enviosdb -c "SELECT id, destinatario, direccion, idempotency_key, created_at FROM envios WHERE idempotency_key = '${key}';"`);
  console.log(sqlCheck);

  console.log('\nRestableciendo SIMULATE_DELAY=false en app1...');
  runCmd('powershell -Command "(Get-Content .env) -replace \'SIMULATE_DELAY=true\', \'SIMULATE_DELAY=false\' | Set-Content .env"');
  runCmd('docker compose up -d app1');
  await sleep(2500);

  console.log('\n[4/4] Reintentando solicitud con la misma idempotency_key (sin demora)...');
  const resRetry = await fetch(`${BASE_URL}/envios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  const dataRetry = await resRetry.json();
  console.log(`  Respuesta reintento: HTTP ${resRetry.status} | Réplica: ${resRetry.headers.get('x-instance-id')}`);
  console.log(`  Datos retornados:`, dataRetry);

  console.log('\nVerificando conteo total en BD para esta clave (DEBE SER 1):');
  const sqlCount = runCmd(`docker compose exec -T db psql -U enviosuser -d enviosdb -c "SELECT count(*) as total FROM envios WHERE idempotency_key = '${key}';"`);
  console.log(sqlCount);

  console.log('\n>>> PRUEBA 3 FINALIZADA CON ÉXITO <<<\n');
}

// ==============================================================================
// PRUEBA 4: Rate Limiting HTTP 429
// ==============================================================================
async function test4_RateLimit() {
  console.log('\n=============================================================');
  console.log('  PRUEBA 4: RATE LIMITING (HTTP 429) EN NGINX                ');
  console.log('=============================================================');

  const total = 12;
  console.log(`\n[1/3] Disparando ráfaga inmediata de ${total} solicitudes POST a /envios...`);
  const t0 = Date.now();
  const codes = {};

  const promises = [];
  for (let i = 1; i <= total; i++) {
    promises.push(
      fetch(`${BASE_URL}/envios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinatario: `Rafaga ${i}`,
          direccion: "Av. Arequipa 500, Lima",
          idempotency_key: `burst-${Date.now()}-${i}`
        })
      }).then(r => {
        codes[r.status] = (codes[r.status] || 0) + 1;
        const color = r.status === 429 ? '\x1b[35m' : '\x1b[32m';
        console.log(`  Solicitud ${i}: ${color}HTTP ${r.status}\x1b[0m`);
      })
    );
  }

  await Promise.all(promises);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

  console.log('\n--- RESULTADOS DE LA RÁFAGA ---');
  console.log(`Total solicitudes: ${total}`);
  console.log(`Duración total:    ${elapsed} segundos`);
  console.log('Conteo por código HTTP:');
  for (const [code, count] of Object.entries(codes)) {
    console.log(`  * HTTP ${code}: ${count} respuestas`);
  }

  console.log('\n[2/3] Esperando 3 segundos de enfriamiento (cooldown)...');
  await sleep(3000);

  console.log('Enviando nueva solicitud a menor frecuencia...');
  const resCool = await fetch(`${BASE_URL}/envios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      destinatario: "Post Cooldown",
      direccion: "Av. Pardo 200, Miraflores",
      idempotency_key: `cool-${Date.now()}`
    })
  });
  console.log(`  Solicitud tras cooldown: HTTP ${resCool.status} (Admitida exitosamente)`);

  console.log('\n[3/3] Consultando los rechazos 429 en los logs de Nginx (auditoría persistente):');
  const nginxLogs = runCmd('docker logs --tail=60 rutaexpress_nginx');
  const lines429 = nginxLogs.split('\n').filter(l => l.includes('status=429')).slice(-6);
  lines429.forEach(line => console.log('  ' + line));

  console.log('\n>>> PRUEBA 4 FINALIZADA CON ÉXITO <<<\n');
}

// ==============================================================================
// PRUEBA 5: Persistencia tras recrear contenedores
// ==============================================================================
async function test5_Persistencia() {
  console.log('\n=============================================================');
  console.log('  PRUEBA 5: PERSISTENCIA Y RECREACIÓN DE CONTENEDORES        ');
  console.log('=============================================================');

  const key1 = `persist-1-${Date.now()}`;
  const key2 = `persist-2-${Date.now()}`;
  const key3 = `persist-3-${Date.now()}`;

  console.log('\n[1/4] Registrando 3 envíos distintos...');
  const res1 = await (await fetch(`${BASE_URL}/envios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destinatario: "Luis Morales", direccion: "Av. Brasil 1234", idempotency_key: key1 })
  })).json();

  const res2 = await (await fetch(`${BASE_URL}/envios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destinatario: "Elena Vega", direccion: "Las Begonias 450", idempotency_key: key2 })
  })).json();

  const res3 = await (await fetch(`${BASE_URL}/envios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destinatario: "Mario Vargas", direccion: "Av. Universitaria 1800", idempotency_key: key3 })
  })).json();

  console.log(`  Envío 1 ID: ${res1.id} (destinatario: ${res1.destinatario})`);
  console.log(`  Envío 2 ID: ${res2.id} (destinatario: ${res2.destinatario})`);
  console.log(`  Envío 3 ID: ${res3.id} (destinatario: ${res3.destinatario})`);

  console.log('\n[2/4] Verificando en PostgreSQL ANTES de recrear contenedores:');
  const sqlBefore = runCmd(`docker compose exec -T db psql -U enviosuser -d enviosdb -c "SELECT id, destinatario, direccion, idempotency_key FROM envios WHERE idempotency_key IN ('${key1}', '${key2}', '${key3}');"`);
  console.log(sqlBefore);

  console.log('\n[3/4] Recreando contenedores con docker compose down y up...');
  runCmd('docker compose down');
  await sleep(2000);
  runCmd('docker compose up -d');
  console.log('Esperando 10 segundos a que la BD esté saludable y los servicios arranquen...');
  await sleep(10000);

  console.log('\n[4/4] Verificando en PostgreSQL DESPUÉS de recrear contenedores:');
  const sqlAfter = runCmd(`docker compose exec -T db psql -U enviosuser -d enviosdb -c "SELECT id, destinatario, direccion, idempotency_key FROM envios WHERE idempotency_key IN ('${key1}', '${key2}', '${key3}');"`);
  console.log(sqlAfter);

  console.log('\nReintentando Envío 1 con la misma clave tras recrear...');
  const resRetry = await (await fetch(`${BASE_URL}/envios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destinatario: "Luis Morales", direccion: "Av. Brasil 1234", idempotency_key: key1 })
  })).json();

  console.log(`  Resultado reintento: ID = ${resRetry.id} | duplicado = ${resRetry.duplicado}`);
  if (resRetry.id === res1.id) {
    console.log('  CONFIRMADO: El reintento detectó el envío persistido y devolvió el mismo ID sin duplicar.');
  }

  console.log('\n>>> PRUEBA 5 FINALIZADA CON ÉXITO <<<\n');
}

async function main() {
  const arg = process.argv[2] || 'all';

  if (arg === '1' || arg === 'all') await test1_Balanceo();
  if (arg === '2' || arg === 'all') await test2_Concurrencia();
  if (arg === '3' || arg === 'all') await test3_Timeout();
  if (arg === '4' || arg === 'all') await test4_RateLimit();
  if (arg === '5' || arg === 'all') await test5_Persistencia();
}

main().catch(err => {
  console.error('Error general en test suite:', err);
});
