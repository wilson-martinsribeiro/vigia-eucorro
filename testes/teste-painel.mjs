// Teste ponta a ponta do painel: sobe o servidor, exercita a API, acompanha ate o fim.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';

const AQUI = process.cwd();
const BASE = 'http://127.0.0.1:4599';
const ok = [], falhas = [];
const checa = (nome, cond, detalhe = '') => {
  (cond ? ok : falhas).push(nome + (detalhe ? ` — ${detalhe}` : ''));
  console.log(`  ${cond ? 'PASSA' : 'FALHA'}  ${nome}${detalhe ? ' — ' + detalhe : ''}`);
};
const dorme = ms => new Promise(r => setTimeout(r, ms));
const get = async p => (await fetch(BASE + p)).json();
const post = async (p, b) => (await fetch(BASE + p, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}),
})).json();

await fs.rm(path.join(AQUI, 'painel-config.json'), { force: true });
await fs.rm(path.join(AQUI, 'ledger-2223.json'), { force: true });
await fs.rm(path.join(AQUI, 'perfil-painel'), { recursive: true, force: true });

const servidor = spawn('xvfb-run', ['-a', process.execPath, 'painel.mjs'], {
  cwd: AQUI,
  env: { ...process.env,
    PAINEL_SEM_ABRIR: '1', PAINEL_PORTA: '4599',
    VE_URL: `file://${AQUI}/mock-eucorro.html`,
    VE_PERFIL: `${AQUI}/perfil-painel`, VE_CANAL: 'chromium',
    VE_SETTLE: '1000', VE_POLL: '2000', VE_STALL: '8000' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let saidaServidor = '';
servidor.stdout.on('data', d => saidaServidor += d);
servidor.stderr.on('data', d => saidaServidor += d);

try {
  // espera subir
  let subiu = false;
  for (let i = 0; i < 30 && !subiu; i++) {
    await dorme(500);
    try { await fetch(BASE + '/api/estado'); subiu = true; } catch {}
  }
  checa('servidor sobe', subiu);
  if (!subiu) throw new Error('servidor nao subiu');

  const html = await (await fetch(BASE + '/')).text();
  checa('serve o painel HTML', html.includes('Vigia EuCorro') && html.includes('btIniciar'));

  const c1 = await get(`/api/contar?pasta=${encodeURIComponent(AQUI + '/fotos3')}`);
  checa('conta fotos da pasta', c1.total === 600, `retornou ${c1.total}`);

  const c2 = await get('/api/contar?pasta=/nao/existe');
  checa('pasta inexistente da erro claro', c2.erro === 'Pasta nao encontrada');

  const r1 = await post('/api/iniciar', { pasta: 'x' });
  checa('recusa config incompleta', !!r1.erro);

  const r2 = await post('/api/iniciar', { pasta: '/nao/existe', idGaleria: '1', alvo: 10, lote: 5 });
  checa('recusa pasta inexistente', r2.erro === 'A pasta informada nao existe.');

  const r3 = await post('/api/iniciar', { pasta: AQUI + '/fotos3', idGaleria: '2223', alvo: 600, lote: 250 });
  checa('aceita e inicia', r3.ok === true, r3.erro || '');

  await dorme(1500);
  const e1 = await get('/api/estado');
  checa('estado reporta rodando', e1.rodando === true);

  const r4 = await post('/api/iniciar', { pasta: AQUI + '/fotos3', idGaleria: '2223', alvo: 600, lote: 250 });
  checa('recusa iniciar duas vezes', r4.erro === 'JA_RODANDO');

  const g = await get('/api/galerias');
  checa('bloqueia galerias com vigia rodando', g.erro === 'PERFIL_OCUPADO');

  // acompanha ate terminar
  let fim = null;
  for (let i = 0; i < 40; i++) {
    await dorme(4000);
    const e = await get('/api/estado');
    process.stdout.write(`     ...enviadas=${e.enviadas}  rodando=${e.rodando}\n`);
    if (!e.rodando) { fim = e; break; }
  }
  checa('vigia termina sozinho', !!fim);
  checa('enviou exatamente o alvo', fim && fim.enviadas === 600, fim ? `enviadas=${fim.enviadas}` : '');
  checa('saiu com codigo 0', fim && fim.codigoSaida === 0, fim ? `codigo=${fim.codigoSaida}` : '');

  const led = JSON.parse(await fs.readFile(path.join(AQUI, 'ledger-2223.json'), 'utf8'));
  const unicos = new Set(led.enviadas);
  checa('ledger sem duplicados', unicos.size === led.enviadas.length && unicos.size === 600,
        `${led.enviadas.length} linhas, ${unicos.size} unicos`);

  const cfgSalva = await get('/api/config');
  checa('salva a config para a proxima vez', cfgSalva.idGaleria === '2223' && cfgSalva.alvo === 600);

  const linhas = fim.linhas.join('\n');
  checa('log limpo (sem ruido do Playwright)', !/\[pid=\d+\]/.test(linhas));
  checa('log mostra os blocos', /bloco 1/.test(linhas) && /ENCERRADO/.test(linhas));

  console.log('\n--- log final como o painel exibe ---');
  fim.linhas.slice(-8).forEach(l => console.log('   ' + l));

} catch (e) {
  console.log('ERRO NO TESTE:', e.message);
  falhas.push('excecao: ' + e.message);
} finally {
  servidor.kill('SIGKILL');
  await dorme(600);
}

console.log(`\n===== ${ok.length} passaram, ${falhas.length} falharam =====`);
if (falhas.length) { console.log('Falhas:'); falhas.forEach(f => console.log('  - ' + f)); }
process.exit(falhas.length ? 1 : 0);
