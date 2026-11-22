// O cenario exato que mordeu o Wilson: a exportacao para no meio, ele volta depois
// e a pasta volta a crescer. O programa TEM que continuar vigiando ate o alvo.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs/promises';

const AQUI = process.cwd(), BASE = 'http://127.0.0.1:4608';
const dorme = ms => new Promise(r => setTimeout(r, ms));
const ok = [], fa = [];
const checa = (n,c,d='') => { (c?ok:fa).push(n); console.log(`  ${c?'PASSA':'FALHA'}  ${n}${d?' — '+d:''}`); };
const get = async p => (await fetch(BASE+p)).json();
const post = async (p,b) => (await fetch(BASE+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})})).json();

try { await fetch(BASE+'/api/estado'); console.log('ERRO: porta 4608 ocupada'); process.exit(2); } catch {}

// ntfy falso, para conferir o aviso de pausa
const recebidos = [];
const ntfy = http.createServer((req,res)=>{ let b=''; req.on('data',c=>b+=c);
  req.on('end',()=>{ try{recebidos.push(JSON.parse(b));}catch{}; res.writeHead(200); res.end('{}'); }); });
await new Promise(r => ntfy.listen(4705,'127.0.0.1',r));

const PASTA = AQUI + '/fotosP';
const ALVO = 900, LOTE = 300;
await fs.rm(PASTA,{recursive:true,force:true});
await fs.rm(AQUI+'/ledger-2223.json',{force:true});
await fs.rm(AQUI+'/painel-config.json',{force:true});
await fs.rm(AQUI+'/perfil-p',{recursive:true,force:true});
const gerar = (de,ate) => new Promise(r => spawn(process.execPath,['gerar.mjs',PASTA,String(de),String(ate),'0'],{stdio:'ignore'}).on('exit',r));

// Comeca com 300: um bloco cheio, e depois a exportacao PARA.
await gerar(1,300);

const srv = spawn('xvfb-run',['-a',process.execPath,'painel.mjs'],{ cwd:AQUI, stdio:['ignore','pipe','pipe'],
  env:{...process.env, PAINEL_SEM_ABRIR:'1', PAINEL_PORTA:'4608', PAINEL_NTFY:'http://127.0.0.1:4705',
       VE_URL:`file://${AQUI}/mock-eucorro.html`, VE_PERFIL:`${AQUI}/perfil-p`, VE_CANAL:'chromium',
       VE_SETTLE:'500', VE_POLL:'1000', VE_STALL:'6000' }});   // pausa considerada em 6s
srv.stdout.on('data',()=>{}); srv.stderr.on('data',()=>{});

try {
  for(let i=0;i<40;i++){ await dorme(500); try{ await fetch(BASE+'/api/estado'); break; }catch{} }
  await post('/api/iniciar',{ pasta:PASTA, idGaleria:'2223', alvo:ALVO, lote:LOTE,
                              avisoTopico:'vigia-teste-pausa', avisoMarco:0 });

  // ── Fase 1: envia o bloco cheio e depois fica parado
  let e = null;
  for(let i=0;i<40;i++){ await dorme(1000); e = await get('/api/estado'); if (e.enviadas >= 300) break; }
  checa('enviou o primeiro bloco', e && e.enviadas === 300, `enviadas=${e?.enviadas}`);

  // ── Fase 2: a exportacao fica parada bem mais que o STALL
  await dorme(12000);
  e = await get('/api/estado');
  checa('NAO encerrou durante a pausa da exportacao', e.rodando === true,
        e.rodando ? 'continua vigiando' : `encerrou com codigo ${e.codigoSaida}`);
  const log1 = (e.linhas||[]).join('\n');
  checa('o log anuncia a pausa mesmo sem sobra na pasta', /exportacao parada — continuo vigiando/.test(log1),
        log1.split('\n').filter(l=>/exportacao parada/.test(l))[0] || 'nenhuma linha de pausa');
  checa('avisou no celular que a exportacao parou',
        recebidos.some(m => /Exportacao parada/.test(m.title||'')));

  // ── Fase 3: volta a exportar — tem que retomar sozinho
  await gerar(301,900);
  let fim = null;
  for(let i=0;i<60;i++){ await dorme(2000); const x = await get('/api/estado'); if(!x.rodando){ fim = x; break; } }
  checa('retomou sozinho e chegou ao alvo', fim && fim.enviadas === ALVO, fim?`enviadas=${fim.enviadas}`:'nao terminou');
  checa('encerrou com codigo 0', fim && fim.codigoSaida === 0, `codigo=${fim?.codigoSaida}`);

  const led = JSON.parse(await fs.readFile(AQUI+'/ledger-2223.json','utf8'));
  const u = new Set(led.enviadas);
  checa('zero duplicados apos a pausa', u.size === led.enviadas.length && u.size === ALVO, `${led.enviadas.length}/${u.size}`);
  const nums = led.enviadas.map(n=>+n.match(/-(\d+)\.jpg$/)[1]).sort((a,b)=>a-b);
  checa('cobertura completa de 1 a 900', nums[0]===1 && nums[898]===899 && nums[899]===900);

  checa('nao avisou "abaixo do alvo"', !/abaixo do alvo/.test((fim?.linhas||[]).join('\n')));
  checa('avisou a conclusao', recebidos.some(m => /Upload concluido/.test(m.title||'')));
} catch(e){ console.log('ERRO:', e.message); fa.push(e.message); }
finally { srv.kill('SIGKILL'); ntfy.close(); await dorme(600); }

console.log(`\n===== ${ok.length} passaram, ${fa.length} falharam =====`);
if (fa.length) fa.forEach(f=>console.log('  - '+f));
process.exit(fa.length?1:0);
