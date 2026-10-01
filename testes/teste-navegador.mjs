// Testa o caminho do navegador no PAINEL: reserva funcionando e ausencia total.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
const AQUI = process.cwd();
const dorme = ms => new Promise(r => setTimeout(r, ms));
const ok = [], fa = [];
const checa = (n, c, d = '') => { (c ? ok : fa).push(n); console.log(`  ${c ? 'PASSA' : 'FALHA'}  ${n}${d ? ' — ' + d : ''}`); };

async function comPainel(porta, envExtra, fn) {
  const srv = spawn('xvfb-run', ['-a', process.execPath, 'painel.mjs'], {
    cwd: AQUI, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PAINEL_SEM_ABRIR: '1', PAINEL_PORTA: String(porta),
           VE_URL_PAINEL: `file://${AQUI}/mock-galerias.html`, ...envExtra },
  });
  srv.stdout.on('data', () => {}); srv.stderr.on('data', () => {});
  const BASE = `http://127.0.0.1:${porta}`;
  try {
    for (let i = 0; i < 40; i++) { await dorme(500); try { await fetch(BASE + '/api/estado'); break; } catch {} }
    await fn(BASE);
  } finally { srv.kill('SIGKILL'); await dorme(600); }
}

console.log('--- D: painel sem Chrome instalado -> usa o Chromium de reserva ---');
await fs.rm(AQUI + '/perfil-navD', { recursive: true, force: true });
await comPainel(4611, { VE_PERFIL: `${AQUI}/perfil-navD`, VE_CANAL: 'msedge' }, async BASE => {
  const r = await (await fetch(BASE + '/api/galerias')).json();
  checa('carrega galerias pela reserva', Array.isArray(r.galerias) && r.galerias.length === 3,
        r.erro || `${(r.galerias || []).length} galerias`);
  const g = (r.galerias || [])[1] || {};
  checa('le id e titulo certos', g.id === '2310' && /GELOBEL/.test(g.titulo || ''), JSON.stringify(g));
  const e = await (await fetch(BASE + '/api/estado')).json();
  checa('log avisa qual navegador abriu', e.linhas.some(l => /navegador: Chromium do Playwright/.test(l)));
  checa('log avisa que o Chrome faltou', e.linhas.some(l => /nao consegui abrir o Chrome instalado/.test(l)));
});

console.log('--- E: painel sem navegador nenhum -> erro SEM_NAVEGADOR ---');
await fs.rm(AQUI + '/perfil-navE', { recursive: true, force: true });
await fs.mkdir('/tmp/claude-0/vazio', { recursive: true });
await comPainel(4612, { VE_PERFIL: `${AQUI}/perfil-navE`, VE_CANAL: 'msedge',
                        PLAYWRIGHT_BROWSERS_PATH: '/tmp/claude-0/vazio' }, async BASE => {
  const r = await (await fetch(BASE + '/api/galerias')).json();
  checa('devolve SEM_NAVEGADOR', r.erro === 'SEM_NAVEGADOR', JSON.stringify(r).slice(0, 120));
  const e = await (await fetch(BASE + '/api/estado')).json();
  checa('painel continua vivo depois da falha', e.rodando === false);
  const html = await (await fetch(BASE + '/')).text();
  checa('pagina traduz SEM_NAVEGADOR para o usuario',
        /SEM_NAVEGADOR'\s*\?\s*'Não encontrei nenhum navegador/.test(html));
});

console.log(`\n===== ${ok.length} passaram, ${fa.length} falharam =====`);
if (fa.length) fa.forEach(f => console.log('  - ' + f));
process.exit(fa.length ? 1 : 0);
