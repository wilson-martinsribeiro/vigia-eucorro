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

const srv = spawn(process.execPath, ['painel.mjs'], { cwd:AQUI, stdio:['ignore','pipe','pipe'],
  env:{...process.env, PAINEL_SEM_ABRIR:'1', PAINEL_PORTA:'4602'} });
srv.stdout.on('data',()=>{}); srv.stderr.on('data',()=>{});
try {
  for(let i=0;i<40;i++){ await dorme(500); try{ await fetch(BASE+'/api/estado'); break; }catch{} }

  const t0 = Date.now();
  const r = await get('/api/escolher-pasta');
  const ms = Date.now() - t0;
  checa('responde sem travar', ms < 5000, `${ms}ms`);
  checa('fora do Windows devolve SO_NAO_SUPORTADO', r.erro === 'SO_NAO_SUPORTADO', JSON.stringify(r));
  checa('nao derruba o servidor', (await get('/api/estado')).rodando === false);

  // com o vigia rodando, tem que recusar
  await post('/api/iniciar', { pasta:AQUI+'/fotos', idGaleria:'9999', alvo:5, lote:5 });
  await dorme(800);
  const r2 = await get('/api/escolher-pasta');
  checa('recusa enquanto o envio roda', r2.erro === 'OCUPADO', JSON.stringify(r2));
  await post('/api/parar');

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
