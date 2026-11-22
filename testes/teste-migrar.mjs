import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const ok=[],fa=[]; const checa=(n,c,d='')=>{(c?ok:fa).push(n);console.log(`  ${c?'PASSA':'FALHA'}  ${n}${d?' — '+d:''}`)};
// Se localiza sozinho: nao depende de onde foi chamado.
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MIG = process.argv[2] || path.join(AQUI, '..', 'programa', 'migrar.mjs');
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'teste-migrar-'));

function montarAntigo(raiz){
  fs.rmSync(raiz,{recursive:true,force:true});
  fs.mkdirSync(path.join(raiz,'perfil-chrome','Default'),{recursive:true});
  fs.mkdirSync(path.join(raiz,'node_modules','playwright'),{recursive:true});
  fs.mkdirSync(path.join(raiz,'versao-anterior'),{recursive:true});
  fs.writeFileSync(path.join(raiz,'perfil-chrome','Default','Cookies'),'LOGIN DO EUCORRO DO WILSON');
  fs.writeFileSync(path.join(raiz,'ledger-2366.json'),JSON.stringify({enviadas:Array.from({length:3914},(_,i)=>`foto-${i+1}.jpg`),total_enviadas:3914}));
  fs.writeFileSync(path.join(raiz,'ledger-2340.json'),'{"enviadas":["a.jpg"]}');
  fs.writeFileSync(path.join(raiz,'ledger-furioso.json'),'{"enviadas":["b.jpg"]}');
  fs.writeFileSync(path.join(raiz,'painel-config.json'),'{"alvo":3914,"avisoTopico":"vigia-secreto"}');
  fs.writeFileSync(path.join(raiz,'diagnostico.log'),'log antigo\n');
  fs.writeFileSync(path.join(raiz,'package.json'),'{}');
  fs.writeFileSync(path.join(raiz,'package-lock.json'),'{}');
  fs.writeFileSync(path.join(raiz,'node_modules','playwright','index.js'),'x');
  fs.writeFileSync(path.join(raiz,'versao-anterior','painel.mjs'),'bem antigo');
  for (const n of ['painel.mjs','painel.html','vigia-eucorro.mjs','VERSAO.txt','COMECE-AQUI.md','INICIAR-PAINEL.bat'])
    fs.writeFileSync(path.join(raiz,n),'versao 4.3 antiga de '+n);
  fs.writeFileSync(path.join(raiz,'ATUALIZAR.bat'),'bat');
  // layout novo chegando por cima
  fs.mkdirSync(path.join(raiz,'programa'),{recursive:true});
  fs.copyFileSync(MIG, path.join(raiz,'programa','migrar.mjs'));
  for (const n of ['painel.mjs','painel.html','vigia-eucorro.mjs','VERSAO.txt','COMECE-AQUI.md'])
    fs.writeFileSync(path.join(raiz,'programa',n),'versao NOVA de '+n);
  fs.writeFileSync(path.join(raiz,'INICIAR-VIGIA-EUCORRO.bat'),'bat');
}
const rodar = raiz => execFileSync(process.execPath,[path.join(raiz,'programa','migrar.mjs')],{encoding:'utf8'});

// ══ CASO 1: instalacao antiga completa ══
console.log('########## CASO 1: pasta antiga, tudo solto na raiz ##########');
const r1 = path.join(BASE,'caso1'); montarAntigo(r1);
const saida1 = rodar(r1);
const naRaiz = fs.readdirSync(r1).sort();
checa('a raiz fica so com os dois .bat e a pasta programa',
      JSON.stringify(naRaiz) === JSON.stringify(['ATUALIZAR.bat','INICIAR-VIGIA-EUCORRO.bat','programa']),
      naRaiz.join(', '));
const dentro = fs.readdirSync(path.join(r1,'programa'));
checa('o login do EuCorro foi preservado',
      fs.readFileSync(path.join(r1,'programa','perfil-chrome','Default','Cookies'),'utf8') === 'LOGIN DO EUCORRO DO WILSON');
const led = JSON.parse(fs.readFileSync(path.join(r1,'programa','ledger-2366.json'),'utf8'));
checa('o ledger de 3.914 fotos chegou inteiro', led.enviadas.length === 3914, `${led.enviadas.length} fotos`);
checa('os tres ledgers vieram', ['ledger-2366.json','ledger-2340.json','ledger-furioso.json'].every(n=>dentro.includes(n)));
checa('a configuracao veio', /vigia-secreto/.test(fs.readFileSync(path.join(r1,'programa','painel-config.json'),'utf8')));
checa('node_modules veio', fs.existsSync(path.join(r1,'programa','node_modules','playwright','index.js')));
checa('os arquivos novos NAO foram sobrescritos pelos antigos',
      fs.readFileSync(path.join(r1,'programa','painel.mjs'),'utf8') === 'versao NOVA de painel.mjs');
const antes = path.join(r1,'programa','versao-anterior','antes-da-reorganizacao');
checa('os antigos foram arquivados, nao apagados',
      fs.existsSync(path.join(antes,'painel.mjs')) && fs.existsSync(path.join(antes,'INICIAR-PAINEL.bat')));
checa('o backup que JA existia em versao-anterior nao foi sobrescrito',
      fs.readFileSync(path.join(r1,'programa','versao-anterior','painel.mjs'),'utf8') === 'bem antigo',
      fs.readFileSync(path.join(r1,'programa','versao-anterior','painel.mjs'),'utf8'));
checa('os seis arquivos antigos da raiz estao arquivados',
      fs.readdirSync(antes).length === 6, fs.readdirSync(antes).join(', '));
checa('explica o que fez', /Organizando a pasta/.test(saida1));

// ══ CASO 2: rodar de novo ══
console.log('\n########## CASO 2: roda uma segunda vez ##########');
const saida2 = rodar(r1);
checa('nao faz nada e fica calado', saida2.trim() === '', JSON.stringify(saida2.slice(0,60)));
const led2 = JSON.parse(fs.readFileSync(path.join(r1,'programa','ledger-2366.json'),'utf8'));
checa('o ledger continua intacto', led2.enviadas.length === 3914);

// ══ CASO 3: instalacao nova, nada antigo ══
console.log('\n########## CASO 3: instalacao do zero ##########');
const r3 = path.join(BASE,'caso3');
fs.rmSync(r3,{recursive:true,force:true});
fs.mkdirSync(path.join(r3,'programa'),{recursive:true});
fs.copyFileSync(MIG, path.join(r3,'programa','migrar.mjs'));
fs.writeFileSync(path.join(r3,'ATUALIZAR.bat'),'bat');
fs.writeFileSync(path.join(r3,'INICIAR-VIGIA-EUCORRO.bat'),'bat');
const saida3 = rodar(r3);
checa('sai calado numa instalacao nova', saida3.trim() === '', JSON.stringify(saida3.slice(0,60)));
checa('nao inventa pastas', fs.readdirSync(r3).sort().join(',') === 'ATUALIZAR.bat,INICIAR-VIGIA-EUCORRO.bat,programa');

// ══ CASO 4: conflito — o dado ja existe no destino ══
console.log('\n########## CASO 4: ja existe ledger no destino ##########');
const r4 = path.join(BASE,'caso4'); montarAntigo(r4);
fs.writeFileSync(path.join(r4,'programa','ledger-2366.json'),'{"enviadas":["JA_ESTAVA_AQUI.jpg"]}');
const saida4 = rodar(r4);
checa('nao sobrescreve o que ja estava no destino',
      /JA_ESTAVA_AQUI/.test(fs.readFileSync(path.join(r4,'programa','ledger-2366.json'),'utf8')));
checa('deixa o antigo na raiz em vez de perder', fs.existsSync(path.join(r4,'ledger-2366.json')));
checa('avisa do conflito', /ja existia aqui/.test(saida4), saida4.split('\n').filter(l=>/ja existia/.test(l))[0]||'');

console.log(`\n===== ${ok.length} passaram, ${fa.length} falharam =====`);
if (fa.length) fa.forEach(f=>console.log('  - '+f));
process.exit(fa.length?1:0);
