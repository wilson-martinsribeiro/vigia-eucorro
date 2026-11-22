// Testa o endpoint da janela de pastas. Aqui e Linux, entao o caminho exercitado e
// o da RECUSA ELEGANTE — que e justamente o que protege o usuario se a janela falhar.
import { spawn } from 'node:child_process';
const AQUI = process.cwd(), BASE = 'http://127.0.0.1:4602';

// Guarda: se algo ja responde nesta porta, o teste conversaria com OUTRO servidor —
// possivelmente de outra pasta — e os resultados seriam falsos. Ja aconteceu.
async function exigirPortaLivre(porta){
  try { await fetch(`http://127.0.0.1:${porta}/api/estado`); }
  catch { return; }
  console.log(`\nERRO: ja existe um servidor respondendo em 127.0.0.1:${porta}.`);
  console.log('Encerre-o antes de rodar este teste, senao o resultado nao vale.');
  process.exit(2);
}

await exigirPortaLivre(4602);

const dorme = ms => new Promise(r => setTimeout(r, ms));
const get = async p => (await fetch(BASE+p)).json();
const post = async (p,b) => (await fetch(BASE+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})})).json();
const ok=[],fa=[]; const checa=(n,c,d='')=>{(c?ok:fa).push(n);console.log(`  ${c?'PASSA':'FALHA'}  ${n}${d?' — '+d:''}`)};

// Precisa de um envio que fique VIVO para testar a recusa por ocupado. Sem mock e
// sem forcar o canal, o vigia sai em menos de 1s num ambiente sem Chrome e o teste
// media o nada.
const srv = spawn('xvfb-run', ['-a', process.execPath, 'painel.mjs'], { cwd:AQUI, stdio:['ignore','pipe','pipe'],
  env:{...process.env, PAINEL_SEM_ABRIR:'1', PAINEL_PORTA:'4602',
       VE_URL:`file://${AQUI}/mock-eucorro.html`, VE_PERFIL:`${AQUI}/perfil-pasta`,
       VE_CANAL:'chromium', VE_SETTLE:'500', VE_POLL:'1500', VE_STALL:'60000'} });
srv.stdout.on('data',()=>{}); srv.stderr.on('data',()=>{});
try {
  for(let i=0;i<40;i++){ await dorme(500); try{ await fetch(BASE+'/api/estado'); break; }catch{} }

  const t0 = Date.now();
  const r = await get('/api/escolher-pasta');
  const ms = Date.now() - t0;
  checa('responde sem travar', ms < 5000, `${ms}ms`);
  checa('fora do Windows devolve SO_NAO_SUPORTADO', r.erro === 'SO_NAO_SUPORTADO', JSON.stringify(r));
  checa('nao derruba o servidor', (await get('/api/estado')).rodando === false);

  // com o vigia rodando, tem que recusar — alvo alto para o envio nao acabar antes
  await post('/api/iniciar', { pasta:AQUI+'/fotos', idGaleria:'2223', alvo:600, lote:200 });
  let vivo = false;
  for (let i=0;i<30;i++){ await dorme(400); if ((await get('/api/estado')).rodando) { vivo = true; break; } }
  checa('o envio esta mesmo rodando antes de testar a recusa', vivo);
  const r2 = await get('/api/escolher-pasta');
  checa('recusa enquanto o envio roda', r2.erro === 'OCUPADO', JSON.stringify(r2));
  await post('/api/parar');
  await dorme(1500);

  const html = await (await fetch(BASE+'/')).text();
  checa('a tela tem o botao Escolher pasta', /id="btEscolher"/.test(html));
  checa('a tela ensina a colar o caminho se a janela falhar',
        /Cole o caminho no campo acima/.test(html));
  checa('o campo de texto continua existindo (saida de emergencia)', /id="pasta"/.test(html));
  checa('a faixa de metricas esta na tela', /id="mExp"/.test(html) && /id="mUp"/.test(html) && /id="mEta"/.test(html));
} catch(e){ console.log('ERRO:',e.message); fa.push(e.message); }
finally { srv.kill('SIGKILL'); await dorme(500); }
console.log(`\n===== ${ok.length} passaram, ${fa.length} falharam =====`);
process.exit(fa.length?1:0);
