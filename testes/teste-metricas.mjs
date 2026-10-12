// Testa as metricas novas: velocidade de exportacao, de upload e estimativa.
// Gera as fotos num ritmo CONHECIDO para poder conferir se a conta bate.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const AQUI = process.cwd(), BASE = 'http://127.0.0.1:4601';

// Guarda: se algo ja responde nesta porta, o teste conversaria com OUTRO servidor —
// possivelmente de outra pasta — e os resultados seriam falsos. Ja aconteceu.
async function exigirPortaLivre(porta){
  try { await fetch(`http://127.0.0.1:${porta}/api/estado`); }
  catch { return; }
  console.log(`\nERRO: ja existe um servidor respondendo em 127.0.0.1:${porta}.`);
  console.log('Encerre-o antes de rodar este teste, senao o resultado nao vale.');
  process.exit(2);
}

await exigirPortaLivre(4601);

const dorme = ms => new Promise(r => setTimeout(r, ms));
const get = async p => (await fetch(BASE + p)).json();
const post = async (p, b) => (await fetch(BASE + p, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(b||{}) })).json();
const ok = [], fa = [];
const checa = (n, c, d='') => { (c?ok:fa).push(n); console.log(`  ${c?'PASSA':'FALHA'}  ${n}${d?' — '+d:''}`); };

const PASTA = AQUI + '/fotosM';
const ALVO = 600, LOTE = 200, INICIAIS = 250;
const RITMO_MS = 100;                       // 1 foto a cada 100ms = 600 fotos/min

await fs.rm(PASTA, { recursive:true, force:true });
await fs.rm(AQUI + '/ledger-2223.json', { force:true });
await fs.rm(AQUI + '/diagnostico.log', { force:true });
await fs.rm(AQUI + '/perfil-m', { recursive:true, force:true });
await new Promise(r => spawn(process.execPath, ['gerar.mjs', PASTA, '1', String(INICIAIS), '0'], {stdio:'ignore'}).on('exit', r));

const srv = spawn('xvfb-run', ['-a', process.execPath, 'painel.mjs'], {
  cwd: AQUI, stdio: ['ignore','pipe','pipe'],
  env: { ...process.env, PAINEL_SEM_ABRIR:'1', PAINEL_PORTA:'4601',
         VE_URL:`file://${AQUI}/mock-eucorro.html`, VE_PERFIL:`${AQUI}/perfil-m`,
         VE_CANAL:'chromium', VE_SETTLE:'800', VE_POLL:'2000', VE_STALL:'60000' },
});
srv.stdout.on('data',()=>{}); srv.stderr.on('data',()=>{});

let viuUpload=0, viuExport=0, viuEta='', viuM=false, fim=null, exportFinal='';
try {
  for (let i=0;i<40;i++){ await dorme(500); try { await fetch(BASE+'/api/estado'); break; } catch {} }
  await post('/api/iniciar', { pasta:PASTA, idGaleria:'2223', alvo:ALVO, lote:LOTE });

  // Lightroom "exportando" o resto num ritmo conhecido
  spawn(process.execPath, ['gerar.mjs', PASTA, String(INICIAIS+1), String(ALVO), String(RITMO_MS)], {stdio:'ignore'});

  for (let i=0;i<60;i++){
    await dorme(2000);
    const e = await get('/api/estado');
    const m = e.metricas || {};
    if (m.upload > 0)     viuUpload = Math.max(viuUpload, m.upload);
    if (m.exportacao > 0) viuExport = Math.max(viuExport, m.exportacao);
    if (m.eta)            viuEta = m.eta;
    if ((e.linhas||[]).some(l => l.includes('@@M'))) viuM = true;
    if (i % 3 === 0) console.log(`     env=${e.enviadas} export=${m.exportacao?Math.round(m.exportacao):'-'} upload=${m.upload?Math.round(m.upload):'-'} eta=${m.eta||'-'} (${m.estadoExport})`);
    if (!e.rodando) { fim = e; exportFinal = m.estadoExport; break; }
  }

  checa('o vigia termina', !!fim);
  checa('enviou exatamente o alvo', fim && fim.enviadas === ALVO, fim?`enviadas=${fim.enviadas}`:'');
  checa('velocidade de upload foi medida', viuUpload > 0, `pico ${Math.round(viuUpload)} fotos/min`);
  checa('velocidade de exportacao foi medida', viuExport > 0, `pico ${Math.round(viuExport)} fotos/min`);
  checa('exportacao medida bate com o ritmo real (600/min, tolerancia ampla)',
        viuExport > 300 && viuExport < 1200, `medido ${Math.round(viuExport)}`);
  checa('estimativa saiu no formato HH:MM:SS', /^\d\d:\d\d:\d\d$/.test(viuEta), viuEta||'nunca apareceu');
  checa('exportacao marcada como concluida no fim', exportFinal === 'concluida', exportFinal||'-');
  checa('linhas @@M NUNCA aparecem no log da tela', !viuM);

  const diag = await fs.readFile(AQUI+'/diagnostico.log','utf8').catch(()=> '');
  checa('linhas @@M nao sujam o diagnostico.log', !diag.includes('@@M'));

  const led = JSON.parse(await fs.readFile(AQUI+'/ledger-2223.json','utf8'));
  const u = new Set(led.enviadas);
  checa('zero duplicados', u.size === led.enviadas.length && u.size === ALVO, `${led.enviadas.length}/${u.size}`);
} catch(e){ console.log('ERRO:', e.message); fa.push(e.message); }
finally { srv.kill('SIGKILL'); await dorme(600); }

console.log(`\n===== ${ok.length} passaram, ${fa.length} falharam =====`);
process.exit(fa.length?1:0);
