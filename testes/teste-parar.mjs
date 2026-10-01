import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
const AQUI=process.cwd(), BASE='http://127.0.0.1:4600';
const dorme=ms=>new Promise(r=>setTimeout(r,ms));
const get=async p=>(await fetch(BASE+p)).json();
const post=async(p,b)=>(await fetch(BASE+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})})).json();
const ok=[],fa=[]; const checa=(n,c,d='')=>{(c?ok:fa).push(n);console.log(`  ${c?'PASSA':'FALHA'}  ${n}${d?' — '+d:''}`)};
await fs.rm(AQUI+'/ledger-2223.json',{force:true});
await fs.rm(AQUI+'/perfil-painel2',{recursive:true,force:true});
const srv=spawn('xvfb-run',['-a',process.execPath,'painel.mjs'],{cwd:AQUI,stdio:['ignore','pipe','pipe'],
  env:{...process.env,PAINEL_SEM_ABRIR:'1',PAINEL_PORTA:'4600',VE_URL:`file://${AQUI}/mock-eucorro.html`,
       VE_PERFIL:`${AQUI}/perfil-painel2`,VE_CANAL:'chromium',VE_SETTLE:'1000',VE_POLL:'2000',VE_STALL:'8000'}});
srv.stdout.on('data',()=>{}); srv.stderr.on('data',()=>{});
try{
  for(let i=0;i<30;i++){await dorme(500);try{await fetch(BASE+'/api/estado');break}catch{}}
  await post('/api/iniciar',{pasta:AQUI+'/fotos3',idGaleria:'2223',alvo:600,lote:250});
  // espera o 1o bloco entrar no ledger
  let antes=0;
  for(let i=0;i<25;i++){await dorme(2000); const e=await get('/api/estado'); if(e.enviadas>0){antes=e.enviadas;break}}
  checa('primeiro bloco registrado antes de parar', antes>0, `enviadas=${antes}`);
  const p=await post('/api/parar'); checa('botao Parar responde ok', p.ok===true);
  await dorme(3000);
  const e2=await get('/api/estado');
  checa('estado volta para parado', e2.rodando===false);
  const led=JSON.parse(await fs.readFile(AQUI+'/ledger-2223.json','utf8'));
  checa('ledger preservado apos parar', led.enviadas.length===antes, `${led.enviadas.length} fotos`);
  // retomada
  const r=await post('/api/iniciar',{pasta:AQUI+'/fotos3',idGaleria:'2223',alvo:600,lote:250});
  checa('reinicia apos parar', r.ok===true);
  let fim=null;
  for(let i=0;i<40;i++){await dorme(4000); const e=await get('/api/estado'); if(!e.rodando){fim=e;break}}
  checa('conclui apos retomada', fim && fim.enviadas===600, fim?`enviadas=${fim.enviadas}`:'sem fim');
  const l2=JSON.parse(await fs.readFile(AQUI+'/ledger-2223.json','utf8'));
  const u=new Set(l2.enviadas);
  checa('zero duplicados apos parar+retomar', u.size===l2.enviadas.length && u.size===600, `${l2.enviadas.length}/${u.size}`);
}catch(e){console.log('ERRO:',e.message);fa.push(e.message)}
finally{srv.kill('SIGKILL');await dorme(500)}
console.log(`\n===== ${ok.length} passaram, ${fa.length} falharam =====`);
process.exit(fa.length?1:0);
