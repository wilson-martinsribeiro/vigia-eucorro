// migrar.mjs — leva a instalacao antiga (tudo solto na raiz) para o layout novo,
// em que a raiz tem so os dois .bat e o resto vive nesta pasta.
//
// Roda uma vez, antes do painel subir. Se nao houver nada antigo, sai calado.
//
// PRINCIPIO: nao perder nada. O ledger diz quais fotos ja subiram e o perfil-chrome
// guarda o login do EuCorro — perder qualquer um dos dois custa horas. Por isso uso
// rename (atomico: ou move inteiro, ou nao move), nunca apago nada, e os arquivos de
// programa antigos vao para versao-anterior em vez do lixo.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));   // ...\programa
const RAIZ = path.dirname(AQUI);                             // ...\automacao-eucorro

// Dados da pessoa: o que nao pode se perder de jeito nenhum.
const DADOS = ['perfil-chrome', 'painel-config.json', 'diagnostico.log',
               'node_modules', 'package.json', 'package-lock.json'];
// Arquivos de programa da versao antiga: ja existem aqui dentro, viram historico.
const ANTIGOS = ['painel.mjs', 'painel.html', 'vigia-eucorro.mjs', 'VERSAO.txt',
                 'COMECE-AQUI.md', 'INICIAR-PAINEL.bat'];

const existe = p => { try { fs.statSync(p); return true; } catch { return false; } };

// rename primeiro: instantaneo e atomico no mesmo disco. Se o Windows recusar
// (arquivo em uso, volume diferente), copia, confere e so entao remove o original.
function mover(de, para) {
  try { fs.renameSync(de, para); return 'movido'; }
  catch (e) {
    if (!['EXDEV', 'EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e;
    try {
      fs.cpSync(de, para, { recursive: true, force: true });
      const a = fs.statSync(de), b = fs.statSync(para);
      if (a.isFile() && a.size !== b.size) return 'falhou:tamanho';
      fs.rmSync(de, { recursive: true, force: true });
      return 'copiado';
    } catch (e2) { return 'falhou:' + (e2.code || e2.message); }
  }
}

function migrar() {
  if (!existe(RAIZ)) return;
  let nomes;
  try { nomes = fs.readdirSync(RAIZ); } catch { return; }

  const ledgers = nomes.filter(n => /^ledger.*\.json$/i.test(n));
  const paraCa  = [...DADOS, ...ledgers, 'versao-anterior'];
  const feitos = [], problemas = [];

  for (const nome of paraCa) {
    const de = path.join(RAIZ, nome), para = path.join(AQUI, nome);
    if (!existe(de)) continue;
    if (existe(para)) {            // ja migrado antes: nao sobrescreve o atual
      problemas.push(`${nome}: ja existia aqui, deixei o antigo na raiz`);
      continue;
    }
    const r = mover(de, para);
    (r.startsWith('falhou') ? problemas : feitos).push(`${nome} (${r})`);
  }

  // Os .mjs/.html/.bat antigos da raiz: nao apago, arquivo em uma subpasta PROPRIA.
  // Nao pode ser direto em versao-anterior: o ATUALIZAR.bat ja guarda backups ali com
  // os mesmos nomes, e o rename sobrescreve calado — o teste pegou exatamente isso.
  const hist = path.join(AQUI, 'versao-anterior', 'antes-da-reorganizacao');
  for (const nome of ANTIGOS) {
    const de = path.join(RAIZ, nome);
    if (!existe(de)) continue;
    try { fs.mkdirSync(hist, { recursive: true }); } catch {}
    const r = mover(de, path.join(hist, nome));
    (r.startsWith('falhou') ? problemas : feitos).push(`${nome} -> versao-anterior (${r})`);
  }

  if (!feitos.length && !problemas.length) return;        // nada a fazer: sai calado
  console.log('Organizando a pasta (so desta vez):');
  feitos.forEach(f => console.log('   ' + f));
  if (problemas.length) {
    console.log('  Pontos de atencao:');
    problemas.forEach(p => console.log('   ' + p));
  }
  console.log('  Pronto. A partir de agora a pasta tem so os dois arquivos de clicar.');
}

try { migrar(); }
catch (e) { console.log('Nao consegui reorganizar a pasta: ' + (e.message || e)); }
