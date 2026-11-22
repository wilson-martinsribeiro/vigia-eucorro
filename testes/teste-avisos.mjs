// Testa os avisos no celular contra um ntfy FALSO rodando aqui, que grava tudo
// que recebe. O ponto mais importante e o CASO 2: um aviso que nao sai nao pode
// derrubar o envio das fotos.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs/promises';

const AQUI = process.cwd();
const dorme = ms => new Promise(r => setTimeout(r, ms));
const ok = [], fa = [];
const checa = (n, c, d='') => { (c?ok:fa).push(n); console.log(`  ${c?'PASSA':'FALHA'}  ${n}${d?' — '+d:''}`); };

async function exigirPortaLivre(porta){
  try { await fetch(`http://127.0.0.1:${porta}/api/estado`); }
  catch { return; }
  console.log(`\nERRO: ja existe um servidor respondendo em 127.0.0.1:${porta}.`);
  process.exit(2);
}

// ─── ntfy falso ──────────────────────────────────────────────────────────────
function ntfyFalso(porta){
  const recebidos = [];
  const s = http.createServer((req,res)=>{
    let b=''; req.on('data',c=>b+=c);
    req.on('end',()=>{ try{ recebidos.push(JSON.parse(b)); }catch{}; res.writeHead(200); res.end('{}'); });
  });
  return new Promise(r => s.listen(porta,'127.0.0.1',()=>r({ servidor:s, recebidos })));
}

async function comPainel(porta, env, fn){
  await exigirPortaLivre(porta);
  const srv = spawn('xvfb-run',['-a',process.execPath,'painel.mjs'],{ cwd:AQUI, stdio:['ignore','pipe','pipe'],
    env:{ ...process.env, PAINEL_SEM_ABRIR:'1', PAINEL_PORTA:String(porta),
          VE_PERFIL:`${AQUI}/perfil-av`, VE_CANAL:'chromium',
          VE_SETTLE:'500', VE_POLL:'1200', VE_STALL:'30000', ...env }});
  srv.stdout.on('data',()=>{}); srv.stderr.on('data',()=>{});
  const BASE = `http://127.0.0.1:${porta}`;
  const get = async p => (await fetch(BASE+p)).json();
  const post = async (p,b) => (await fetch(BASE+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})})).json();
  try {
    for(let i=0;i<40;i++){ await dorme(500); try{ await fetch(BASE+'/api/estado'); break; }catch{} }
    await fn({ BASE, get, post });
  } finally { srv.kill('SIGKILL'); await dorme(600); }
}

const limpar = async () => {
  for (const f of ['ledger-2223.json','painel-config.json','diagnostico.log']) await fs.rm(AQUI+'/'+f,{force:true});
  await fs.rm(AQUI+'/perfil-av',{recursive:true,force:true});
};
const esperarFim = async get => { for(let i=0;i<60;i++){ await dorme(2000); const e=await get('/api/estado'); if(!e.rodando) return e; } return null; };

// ══════════════ CASO 1: caminho feliz ══════════════
console.log('########## CASO 1: envio completo, avisos a cada 200 fotos ##########');
await limpar();
const n1 = await ntfyFalso(4701);
await comPainel(4603, { PAINEL_NTFY:'http://127.0.0.1:4701', VE_URL:`file://${AQUI}/mock-eucorro.html` }, async ({get,post}) => {
  const t = await post('/api/testar-aviso', { topico:'vigia-teste-abc' });
  checa('botao Testar aviso envia', t.ok === true, JSON.stringify(t));
  checa('o teste chega com titulo claro', n1.recebidos.some(m => /Teste do Vigia/.test(m.title||'')));
  checa('vai para o canal informado', n1.recebidos[0]?.topic === 'vigia-teste-abc', n1.recebidos[0]?.topic);

  await post('/api/config', { avisoTopico:'vigia-teste-abc', avisoMarco:200 });
  await post('/api/iniciar', { pasta:AQUI+'/fotos', idGaleria:'2223', alvo:600, lote:200, avisoTopico:'vigia-teste-abc', avisoMarco:200 });
  const fim = await esperarFim(get);
  checa('envio concluiu', fim && fim.enviadas === 600, fim?`enviadas=${fim.enviadas}`:'sem fim');
  await dorme(1500);

  const tit = n1.recebidos.map(m => m.title||'');
  const txt = n1.recebidos.map(m => m.message||'');
  checa('avisa que comecou', tit.includes('Envio iniciado'));
  checa('aviso de inicio e silencioso (prioridade 2)',
        n1.recebidos.find(m=>m.title==='Envio iniciado')?.priority === 2);

  // Marcos usam o titulo "Vigia EuCorro"; o aviso de inicio usa outro titulo.
  const marcos = n1.recebidos.filter(m => m.title === 'Vigia EuCorro').map(m => m.message||'');
  const numeros = marcos.map(m => m.split(' ')[0]);
  checa('avisou nos marcos de 200', marcos.length === 3, `${marcos.length} marcos: ${numeros.join(', ')}`);
  checa('marcos nos numeros certos', numeros.join(',') === '200,400,600', numeros.join(','));
  checa('nenhum marco repetido', new Set(numeros).size === numeros.length);
  checa('o marco traz a velocidade medida', marcos.some(m => /fotos\/min/.test(m)), marcos[0]||'');
  checa('avisa a conclusao', tit.includes('Upload concluido'));
  checa('a conclusao diz quantas foram', /600 fotos enviadas/.test(txt.find(t=>/enviadas com sucesso/.test(t))||''));
});
n1.servidor.close();

// ══════════════ CASO 2: o ntfy esta fora do ar ══════════════
console.log('\n########## CASO 2: servico de aviso FORA DO AR ##########');
await limpar();
await comPainel(4604, { PAINEL_NTFY:'http://127.0.0.1:4799', VE_URL:`file://${AQUI}/mock-eucorro.html` }, async ({get,post}) => {
  await post('/api/config', { avisoTopico:'vigia-teste-abc', avisoMarco:200 });
  await post('/api/iniciar', { pasta:AQUI+'/fotos', idGaleria:'2223', alvo:600, lote:200, avisoTopico:'vigia-teste-abc', avisoMarco:200 });
  const fim = await esperarFim(get);
  checa('o envio conclui mesmo sem conseguir avisar', fim && fim.enviadas === 600, fim?`enviadas=${fim.enviadas}`:'sem fim');
  checa('saiu com codigo 0', fim && fim.codigoSaida === 0);
  const linhas = (fim?.linhas||[]).join('\n');
  checa('reclama na tela UMA vez so', (linhas.match(/nao consegui mandar a notificacao/g)||[]).length === 1,
        `${(linhas.match(/nao consegui mandar a notificacao/g)||[]).length} vez(es)`);
  const diag = await fs.readFile(AQUI+'/diagnostico.log','utf8').catch(()=>'');
  checa('as falhas de aviso ficam registradas no diagnostico', /\[aviso\]/.test(diag));
  const led = JSON.parse(await fs.readFile(AQUI+'/ledger-2223.json','utf8'));
  checa('zero duplicados mesmo com aviso falhando', new Set(led.enviadas).size === 600);
});

// ══════════════ CASO 3: precisa de voce (login) ══════════════
console.log('\n########## CASO 3: o site pede login ##########');
await limpar();
const n3 = await ntfyFalso(4702);
await comPainel(4605, { PAINEL_NTFY:'http://127.0.0.1:4702', VE_URL:`file://${AQUI}/sem-uploader.html`,
                        VE_ESPERA_LOGIN:'4000' }, async ({get,post}) => {
  await post('/api/config', { avisoTopico:'vigia-teste-abc', avisoMarco:200 });
  await post('/api/iniciar', { pasta:AQUI+'/fotos', idGaleria:'2223', alvo:600, lote:200, avisoTopico:'vigia-teste-abc', avisoMarco:200 });
  const fim = await esperarFim(get);
  await dorme(1500);
  checa('encerra com codigo 2 (precisa de login)', fim && fim.codigoSaida === 2, fim?`codigo=${fim.codigoSaida}`:'sem fim');
  const precisa = n3.recebidos.filter(m => m.title === 'Precisa de voce');
  checa('avisa que precisa de voce', precisa.length >= 1, `${precisa.length} aviso(s)`);
  checa('o aviso e urgente (prioridade 5)', precisa.every(m => m.priority === 5));
  checa('a mensagem diz o que fazer', precisa.some(m => /login/i.test(m.message||'')), precisa[0]?.message||'');
  checa('nao avisa conclusao com sucesso', !n3.recebidos.some(m => m.title === 'Upload concluido'));
});
n3.servidor.close();

// ══════════════ CASO 4: Parar a pedido nao e falha ══════════════
console.log('\n########## CASO 4: usuario clica em Parar ##########');
await limpar();
const n4 = await ntfyFalso(4703);
await comPainel(4606, { PAINEL_NTFY:'http://127.0.0.1:4703', VE_URL:`file://${AQUI}/mock-eucorro.html` }, async ({get,post}) => {
  await post('/api/config', { avisoTopico:'vigia-teste-abc', avisoMarco:200 });
  await post('/api/iniciar', { pasta:AQUI+'/fotos', idGaleria:'2223', alvo:600, lote:200, avisoTopico:'vigia-teste-abc', avisoMarco:200 });
  for(let i=0;i<20;i++){ await dorme(1000); if((await get('/api/estado')).enviadas>0) break; }
  await post('/api/parar');
  await dorme(3000);
  checa('parou', (await get('/api/estado')).rodando === false);
  // Asserção por LISTA BRANCA: a versao anterior so procurava dois titulos e deixou
  // passar um "O programa parou com falha" disparado pelo proprio clique em Parar.
  const permitidos = new Set(['Envio iniciado', 'Vigia EuCorro']);
  const intrusos = n4.recebidos.map(m => m.title||'').filter(t => !permitidos.has(t));
  checa('NAO manda aviso nenhum de erro ao parar a pedido', intrusos.length === 0,
        intrusos.length ? 'intrusos: ' + intrusos.join(' | ') : 'so inicio e marcos');
  checa('nada urgente foi disparado', !n4.recebidos.some(m => (m.priority||3) >= 4),
        n4.recebidos.filter(m=>(m.priority||3)>=4).map(m=>m.title).join(' | '));
});
n4.servidor.close();

// ══════════════ CASO 5: sem canal configurado ══════════════
console.log('\n########## CASO 5: ninguem configurou canal de aviso ##########');
await limpar();
const n5 = await ntfyFalso(4704);
await comPainel(4607, { PAINEL_NTFY:'http://127.0.0.1:4704', VE_URL:`file://${AQUI}/mock-eucorro.html` }, async ({get,post}) => {
  await post('/api/iniciar', { pasta:AQUI+'/fotos', idGaleria:'2223', alvo:600, lote:200, avisoTopico:'', avisoMarco:200 });
  const fim = await esperarFim(get);
  await dorme(1500);
  checa('envio normal sem canal configurado', fim && fim.enviadas === 600, fim?`enviadas=${fim.enviadas}`:'sem fim');
  checa('nao tenta mandar nada', n5.recebidos.length === 0, `${n5.recebidos.length} requisicoes`);
  const linhas = (fim?.linhas||[]).join('\n');
  checa('nao reclama de aviso na tela', !/nao consegui mandar a notificacao/.test(linhas));
});
n5.servidor.close();

console.log(`\n===== ${ok.length} passaram, ${fa.length} falharam =====`);
if (fa.length) fa.forEach(f=>console.log('  - '+f));
process.exit(fa.length?1:0);
