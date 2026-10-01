// vigia-eucorro.mjs — observa a pasta de fotos tratadas e sobe ao EuCorro de N em N.
//
// Roda uma vez e fica de vigia: a cada LOTE fotos novas que o Lightroom exportar,
// envia esse bloco, anota no ledger e volta a observar. Termina ao atingir ALVO.
//
// SETUP (uma vez so):
//   1. Node.js LTS  ->  https://nodejs.org
//   2. mkdir C:\automacao && cd C:\automacao && npm init -y && npm i playwright@^1.63
//   3. npx playwright install chromium
//   4. node vigia-eucorro.mjs    -> abre Chrome limpo; faca o login do EuCorro nele.
//      A sessao fica salva no perfil dedicado; execucoes seguintes ja entram logadas.
//
// SEGURANCA DE DADOS:
//   - Nunca envia um arquivo que o Lightroom ainda esteja gravando (guarda de mtime).
//   - Ledger em JSON: se o script cair, reinicie e ele retoma exatamente de onde parou.
//   - O EuCorro deduplica sozinho ("Repetida"), entao reenvio acidental nao duplica nada.

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Tudo fica ao lado deste arquivo — assim a pasta inteira funciona em qualquer
// computador, sem editar caminho nenhum.
const AQUI = path.dirname(fileURLToPath(import.meta.url));

// ─── CONFIGURACAO ────────────────────────────────────────────────────────────
// Normalmente voce NAO edita nada aqui: o painel passa tudo por variavel de ambiente.
const cfg = {
  PASTA:      process.env.VE_PASTA   || '',      // obrigatorio (o painel envia)
  ID_GALERIA: process.env.VE_ID      || '',      // obrigatorio (o painel envia)
  ALVO:  Number(process.env.VE_ALVO  || 0),      // total esperado do lote
  LOTE:  Number(process.env.VE_LOTE  || 500),    // envia de 500 em 500
  PERFIL:     process.env.VE_PERFIL  || path.join(AQUI, 'perfil-chrome'),
  LEDGER:     process.env.VE_LEDGER  || path.join(AQUI, 'ledger.json'),
  HEADLESS:  (process.env.VE_HEADLESS || 'false') === 'true',
  URL:        process.env.VE_URL     || null,    // so o teste sobrescreve
  CANAL:      process.env.VE_CANAL   || 'chrome',
};

const URL_FORM  = cfg.URL || `https://www.eucorro.com/painel/aws_upload/index.php?id=${cfg.ID_GALERIA}`;
const SETTLE_MS = Number(process.env.VE_SETTLE || 8_000);    // so entra na fila se parado ha 8s (Lightroom terminou de gravar)
const POLL_MS   = Number(process.env.VE_POLL   || 15_000);   // intervalo entre varreduras da pasta
const STALL_MS  = Number(process.env.VE_STALL  || 180_000);  // sem arquivo novo por 3 min => manda o resto sem completar LOTE
const T_SET     = 15 * 60_000;
const T_ESTAG   = 10 * 60_000;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ─── Ledger ──────────────────────────────────────────────────────────────────
async function lerLedger() {
  try {
    const j = JSON.parse(await fs.readFile(cfg.LEDGER, 'utf8'));
    return new Set(j.enviadas || []);
  } catch { return new Set(); }
}
async function gravarLedger(set, extra = {}) {
  const dir = path.dirname(cfg.LEDGER);
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
  await fs.writeFile(cfg.LEDGER, JSON.stringify({
    atualizado: new Date().toISOString(), pasta: cfg.PASTA, id_galeria: cfg.ID_GALERIA,
    total_enviadas: set.size, alvo: cfg.ALVO, ...extra,
    enviadas: [...set],
  }, null, 2));
}

// ─── Varredura: so arquivos "assentados" ─────────────────────────────────────
async function varrer(jaEnviadas) {
  const nomes = (await fs.readdir(cfg.PASTA)).filter(f => /\.jpe?g$/i.test(f));
  const agora = Date.now();
  const novos = [];
  for (const nome of nomes) {
    if (jaEnviadas.has(nome)) continue;
    const st = await fs.stat(path.join(cfg.PASTA, nome)).catch(() => null);
    if (!st) continue;
    if (agora - st.mtimeMs < SETTLE_MS) continue;   // ainda sendo gravado
    novos.push(nome);
  }
  novos.sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  return { novos, totalNaPasta: nomes.length };
}

// ─── Envio de um bloco ───────────────────────────────────────────────────────
async function enviarBloco(page, nomes) {
  const caminhos = nomes.map(n => path.resolve(cfg.PASTA, n));

  const input = page.locator('#fotos');
  if (await input.count() === 0) throw new Error('SESSAO_EXPIRADA');

  await input.setInputFiles(caminhos, { timeout: T_SET });

  const n = await input.evaluate(el => el.files.length);
  if (n !== caminhos.length) throw new Error(`fila recebeu ${n} de ${caminhos.length}`);

  await page.locator('#envia').click();

  const contar = () => page.evaluate(() => {
    const linhas = [...document.querySelectorAll('table tbody tr')];
    let ok = 0, erro = 0;
    for (const tr of linhas) {
      const s = (tr.cells[tr.cells.length - 1]?.innerText || '').trim().toLowerCase();
      if (!s) continue;                                   // ainda nao comecou
      if (/enviando|processando|aguard|fila|%/.test(s)) continue;   // em andamento
      if (/erro|falha|fail/.test(s)) erro++;
      else ok++;   // sucesso, repetida, duplicada, "ja enviada" — qualquer estado final nao-erro
    }
    return { total: linhas.length, ok, erro };
  });

  let ultimo = -1, marco = Date.now();
  while (true) {
    await page.waitForTimeout(2_000);
    const c = await contar();
    const feito = c.ok + c.erro;
    if (feito !== ultimo) { ultimo = feito; marco = Date.now(); }
    if (c.total >= caminhos.length && feito >= c.total) return c;
    if (Date.now() - marco > T_ESTAG) throw new Error(`estagnado em ${feito}/${c.total}`);
  }
}

// ─── Principal ───────────────────────────────────────────────────────────────
if (!cfg.PASTA || !cfg.ID_GALERIA || !cfg.ALVO) {
  log('Faltou configuracao. Use o painel (INICIAR-PAINEL.bat) — ele preenche tudo.');
  log('Se for rodar direto, defina VE_PASTA, VE_ID e VE_ALVO.');
  process.exit(3);
}

const enviadas = await lerLedger();
log(`vigia iniciado — alvo ${cfg.ALVO}, lote ${cfg.LOTE}, ja enviadas ${enviadas.size}`);
log(`pasta: ${cfg.PASTA}`);

// ─── Abre o navegador, com alternativa ───────────────────────────────────────
// Ordem: o Chrome instalado na maquina (rapido, e o navegador que a pessoa conhece).
// Se nao houver Chrome, cai para o Chromium que o Playwright baixou na instalacao.
// Sem isso, uma maquina sem Chrome falhava mesmo tendo o Chromium baixado.
async function abrirNavegador() {
  const tentativas = cfg.CANAL === 'chromium'
    ? [{ nome: 'Chromium do Playwright', op: {} }]
    : [{ nome: `Chrome instalado (${cfg.CANAL})`, op: { channel: cfg.CANAL } },
       { nome: 'Chromium do Playwright', op: {} }];

  let ultimoErro;
  for (let i = 0; i < tentativas.length; i++) {
    const t = tentativas[i];
    try {
      const c = await chromium.launchPersistentContext(cfg.PERFIL, {
        ...t.op, headless: cfg.HEADLESS, viewport: null, timeout: 120_000,
      });
      log(`navegador: ${t.nome}`);
      return c;
    } catch (e) {
      ultimoErro = e;
      const resta = i < tentativas.length - 1;
      log(`nao consegui abrir o ${t.nome}${resta ? ' — tentando alternativa...' : '.'}`);
    }
  }
  throw new Error((ultimoErro?.message || 'erro desconhecido').split('\n')[0]);
}

let ctx;
try {
  ctx = await abrirNavegador();
} catch (e) {
  log('Nao foi possivel abrir nenhum navegador neste computador.');
  log('Resolva de uma destas formas:');
  log('  1) Instale o Google Chrome: https://www.google.com/chrome');
  log('  2) Ou rode nesta pasta: npx playwright install chromium');
  log('Detalhe tecnico: ' + e.message);
  process.exit(4);
}

let saida = 0;
try {
  const page = ctx.pages()[0] ?? await ctx.newPage();
  page.on('pageerror', e => log('[pageerror]', e.message));
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto(URL_FORM, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Primeira execucao (ou sessao expirada): espera voce logar na janela, em vez de sair.
  if (await page.locator('#fotos').count() === 0) {
    if (cfg.HEADLESS) {
      log('ERRO: sessao nao logada e rodando sem janela. Rode uma vez com HEADLESS: false para logar.');
      process.exit(2);
    }
    const ESPERA_LOGIN = Number(process.env.VE_ESPERA_LOGIN || 15 * 60_000);
    log('='.repeat(64));
    log('FACA O LOGIN DO EUCORRO NA JANELA DO CHROME QUE ABRIU.');
    log('Assim que o uploader carregar, eu sigo sozinho. Aguardando ate 15 min...');
    log('='.repeat(64));
    const limite = Date.now() + ESPERA_LOGIN;
    let urlAnterior = page.url(), ultimaNav = Date.now();
    while (Date.now() < limite) {
      await page.waitForTimeout(3_000);
      if (await page.locator('#fotos').count() > 0) break;

      // NUNCA re-navegar enquanto voce pode estar digitando a senha.
      // So volto ao uploader se a URL mudou (voce concluiu o login e o site te
      // redirecionou) ou se ja faz 60s desde a ultima tentativa.
      const urlAgora = page.url();
      const mudou = urlAgora !== urlAnterior;
      if ((mudou || Date.now() - ultimaNav > 60_000) && !urlAgora.includes('aws_upload')) {
        urlAnterior = urlAgora; ultimaNav = Date.now();
        await page.goto(URL_FORM, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
        urlAnterior = page.url();
      } else {
        urlAnterior = urlAgora;
      }
    }
    if (await page.locator('#fotos').count() === 0) {
      log('Tempo de login esgotado. Rode de novo quando puder logar.');
      process.exit(2);
    }
    log('Login detectado. Comecando a vigia.');
  }

  let ultimoCrescimento = Date.now(), ultimoTotalPasta = -1, blocos = 0;

  while (enviadas.size < cfg.ALVO) {
    const { novos, totalNaPasta } = await varrer(enviadas);

    if (totalNaPasta !== ultimoTotalPasta) { ultimoTotalPasta = totalNaPasta; ultimoCrescimento = Date.now(); }
    const paradoHa = Date.now() - ultimoCrescimento;

    // Envia quando juntou o lote, ou quando a exportacao parou e sobrou resto
    const fecharResto = novos.length > 0 && paradoHa > STALL_MS;
    if (novos.length < cfg.LOTE && !fecharResto) {
      log(`aguardando — ${novos.length}/${cfg.LOTE} novas prontas (pasta: ${totalNaPasta}, enviadas: ${enviadas.size})`);
      await new Promise(r => setTimeout(r, POLL_MS));
      continue;
    }

    // Nunca ultrapassa o ALVO, mesmo que a pasta tenha mais arquivos que o esperado
    const restante = cfg.ALVO - enviadas.size;
    const bloco = novos.slice(0, Math.min(cfg.LOTE, restante));
    blocos++;
    log(`bloco ${blocos}: enviando ${bloco.length} (${bloco[0]} … ${bloco[bloco.length - 1]})`);
    const t0 = Date.now();

    const r = await enviarBloco(page, bloco);

    bloco.forEach(n => enviadas.add(n));
    await gravarLedger(enviadas, { ultimo_bloco: { qtd: bloco.length, ok: r.ok, erro: r.erro } });

    const seg = ((Date.now() - t0) / 1000).toFixed(0);
    log(`bloco ${blocos} OK em ${seg}s — ok=${r.ok} erro=${r.erro} | acumulado ${enviadas.size}/${cfg.ALVO}`);

    if (fecharResto && novos.length <= cfg.LOTE) {
      log('exportacao parada e resto enviado.');
      if (enviadas.size < cfg.ALVO) log(`ATENCAO: fechei com ${enviadas.size}, abaixo do alvo ${cfg.ALVO}.`);
      break;
    }
  }

  log(`FIM — ${enviadas.size} fotos enviadas em ${blocos} blocos.`);
  const sobra = await varrer(enviadas);
  if (sobra.novos.length > 0) {
    log(`AVISO: a pasta tem mais ${sobra.novos.length} foto(s) alem do alvo de ${cfg.ALVO}.`);
    log(`Se quiser subir tambem, aumente ALVO para ${enviadas.size + sobra.novos.length} e rode de novo.`);
  }

} catch (e) {
  log('FALHA:', e.message);
  await gravarLedger(enviadas, { falha: e.message });
  try { await ctx.pages()[0]?.screenshot({ path: path.join(path.dirname(cfg.LEDGER), 'falha.png') }); } catch {}
  saida = e.message === 'SESSAO_EXPIRADA' ? 2 : 1;
} finally {
  await ctx.close();
  process.exit(saida);
}
