// painel.mjs — painel local para o vigia do EuCorro.
// Sobe um servidor em http://127.0.0.1:4599 (so a sua maquina enxerga) e abre o navegador.
//
// NAO guarda login nem senha. A sessao do EuCorro vive no perfil dedicado do Chrome:
// voce loga uma vez na janela e ela persiste entre execucoes.

import http from 'node:http';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { spawn, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI   = path.dirname(fileURLToPath(import.meta.url));
const PORTA  = Number(process.env.PAINEL_PORTA || 4599);
const PERFIL = process.env.VE_PERFIL || path.join(AQUI, 'perfil-chrome');
const CONFIG = path.join(AQUI, 'painel-config.json');

let proc = null;                 // processo do vigia
let linhas = [];                 // ultimas linhas de log
let clientes = [];               // conexoes SSE
let estado = { rodando: false, iniciadoEm: null, ultimoErro: null };

const agora = () => new Date().toISOString().slice(11, 19);

function emitir(linha) {
  const l = `${agora()} ${linha}`;
  linhas.push(l);
  if (linhas.length > 400) linhas = linhas.slice(-400);
  for (const c of clientes) { try { c.write(`data: ${JSON.stringify(l)}\n\n`); } catch {} }
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function corpo(req) {
  return new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } }); });
}

// ─── Conta JPGs de uma pasta ─────────────────────────────────────────────────
async function contarPasta(pasta) {
  const nomes = (await fs.readdir(pasta)).filter(f => /\.jpe?g$/i.test(f));
  return nomes.length;
}

// ─── Le as galerias do EuCorro usando o perfil ja logado ─────────────────────
// Precisa do perfil livre: o Chrome nao abre duas instancias no mesmo perfil.
// Mesma ordem do vigia: Chrome instalado primeiro, Chromium do Playwright como reserva.
async function abrirNavegador(chromium) {
  const canal = process.env.VE_CANAL || 'chrome';
  const tentativas = canal === 'chromium'
    ? [{ nome: 'Chromium do Playwright', op: {} }]
    : [{ nome: `Chrome instalado (${canal})`, op: { channel: canal } },
       { nome: 'Chromium do Playwright', op: {} }];

  for (let i = 0; i < tentativas.length; i++) {
    const t = tentativas[i];
    try {
      const c = await chromium.launchPersistentContext(PERFIL, {
        ...t.op, headless: false, viewport: null, timeout: 120_000,
      });
      emitir(`navegador: ${t.nome}`);
      return c;
    } catch (e) {
      const resta = i < tentativas.length - 1;
      emitir(`nao consegui abrir o ${t.nome}${resta ? ' — tentando alternativa...' : '.'}`);
    }
  }
  throw new Error('SEM_NAVEGADOR');
}

async function lerGalerias() {
  if (proc) throw new Error('PERFIL_OCUPADO');
  const { chromium } = await import('playwright');
  const ctx = await abrirNavegador(chromium);
  try {
    const page = ctx.pages()[0] ?? await ctx.newPage();
    const url = process.env.VE_URL_PAINEL || 'https://www.eucorro.com/painel/fotos/';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Se caiu no login, espera voce logar (sem re-navegar por cima da digitacao)
    const temTabela = () => page.locator('table tbody tr').count().then(n => n > 0);
    if (!(await temTabela())) {
      emitir('Faca o login do EuCorro na janela que abriu — aguardando ate 10 min...');
      const limite = Date.now() + 10 * 60_000;
      let urlAnt = page.url(), ultimaNav = Date.now();
      while (Date.now() < limite) {
        await page.waitForTimeout(3_000);
        if (await temTabela()) break;
        const u = page.url();
        if ((u !== urlAnt || Date.now() - ultimaNav > 60_000) && !u.includes('/painel/fotos')) {
          urlAnt = u; ultimaNav = Date.now();
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
          urlAnt = page.url();
        } else urlAnt = u;
      }
      if (!(await temTabela())) throw new Error('LOGIN_NAO_CONCLUIDO');
    }

    const galerias = await page.evaluate(() => {
      return [...document.querySelectorAll('table tbody tr')].map(tr => {
        const a = [...tr.querySelectorAll('a')].find(x => (x.getAttribute('href') || '').includes('aws_upload'));
        if (!a) return null;
        const id = (a.getAttribute('href').match(/id=(\d+)/) || [])[1];
        const celulas = [...tr.cells].map(c => c.innerText.trim());
        const titulo = celulas.find(t => /\w{4,}/.test(t) && !/^\d+$/.test(t)) || `galeria ${id}`;
        const qtd = celulas.find(t => /^\d+$/.test(t)) || '0';
        return id ? { id, titulo, qtd } : null;
      }).filter(Boolean);
    });
    emitir(`${galerias.length} galerias carregadas.`);
    return galerias;
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ─── Inicia / para o vigia ───────────────────────────────────────────────────
function iniciar(cfg) {
  if (proc) throw new Error('JA_RODANDO');
  const env = {
    ...process.env,
    VE_PASTA: cfg.pasta,
    VE_ID: String(cfg.idGaleria),
    VE_ALVO: String(cfg.alvo),
    VE_LOTE: String(cfg.lote),
    VE_PERFIL: PERFIL,
    VE_LEDGER: path.join(AQUI, `ledger-${cfg.idGaleria}.json`),
    VE_HEADLESS: 'false',
  };
  if (process.env.VE_URL)   env.VE_URL   = process.env.VE_URL;    // usado nos testes
  if (process.env.VE_CANAL) env.VE_CANAL = process.env.VE_CANAL;
  if (process.env.VE_SETTLE) env.VE_SETTLE = process.env.VE_SETTLE;
  if (process.env.VE_POLL)   env.VE_POLL   = process.env.VE_POLL;
  if (process.env.VE_STALL)  env.VE_STALL  = process.env.VE_STALL;

  linhas = [];
  emitir(`Iniciando: ${cfg.alvo} fotos, blocos de ${cfg.lote}, galeria ${cfg.idGaleria}`);
  emitir(`Pasta: ${cfg.pasta}`);

  proc = spawn(process.execPath, [path.join(AQUI, 'vigia-eucorro.mjs')], { env, cwd: AQUI });
  estado = { rodando: true, iniciadoEm: new Date().toISOString(), ultimoErro: null, cfg };

  // O Playwright despeja log interno no stderr quando algo falha. Isso e util pra
  // diagnostico, mas polui o painel — mando para um arquivo e mostro so o essencial.
  const bruto = fss.createWriteStream(path.join(AQUI, 'diagnostico.log'), { flags: 'a' });
  const ruido = l =>
    /\[pid=\d+\]/.test(l) || /^\s*- </.test(l) || /^\s+at /.test(l) ||
    /^\x1b\[2m/.test(l) || /browserType\.launch|Node\.js v\d/.test(l);

  const ler = fluxo => {
    let buf = '';
    fluxo.on('data', d => {
      buf += d.toString();
      const partes = buf.split('\n'); buf = partes.pop();
      for (const l of partes.filter(Boolean)) {
        bruto.write(l + '\n');
        const limpa = l.replace(/\x1b\[\d+m/g, '').replace(/^\d\d:\d\d:\d\d /, '');
        if (!ruido(limpa)) emitir(limpa);
      }
    });
  };
  ler(proc.stdout); ler(proc.stderr);

  proc.on('exit', code => {
    emitir(code === 0 ? '=== VIGIA ENCERRADO (tudo certo) ==='
         : code === 2 ? '=== ENCERRADO: precisa fazer login na janela do Chrome ==='
         : code === 4 ? '=== ENCERRADO: nenhum navegador encontrado neste computador. Instale o Google Chrome em google.com/chrome e tente de novo. ==='
         : `=== ENCERRADO com codigo ${code} ===`);
    estado.rodando = false; estado.codigoSaida = code;
    proc = null;
  });
  return true;
}

function parar() {
  if (!proc) return false;
  emitir('Parando a pedido...');
  proc.kill();          // o ledger ja tem tudo que foi enviado; retoma depois
  return true;
}

// ─── Servidor ────────────────────────────────────────────────────────────────
const servidor = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORTA}`);
  try {
    if (u.pathname === '/' || u.pathname === '/index.html') {
      const html = await fs.readFile(path.join(AQUI, 'painel.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    if (u.pathname === '/api/estado') {
      let enviadas = 0;
      const cfg = estado.cfg;
      if (cfg) {
        try {
          const j = JSON.parse(await fs.readFile(path.join(AQUI, `ledger-${cfg.idGaleria}.json`), 'utf8'));
          enviadas = j.total_enviadas || (j.enviadas || []).length;
        } catch {}
      }
      return json(res, 200, { ...estado, enviadas, linhas: linhas.slice(-200) });
    }

    if (u.pathname === '/api/contar') {
      const pasta = u.searchParams.get('pasta') || '';
      try { return json(res, 200, { total: await contarPasta(pasta) }); }
      catch (e) { return json(res, 400, { erro: 'Pasta nao encontrada' }); }
    }

    if (u.pathname === '/api/galerias') {
      try { return json(res, 200, { galerias: await lerGalerias() }); }
      catch (e) { return json(res, 400, { erro: e.message }); }
    }

    if (u.pathname === '/api/config' && req.method === 'GET') {
      try { return json(res, 200, JSON.parse(await fs.readFile(CONFIG, 'utf8'))); }
      catch { return json(res, 200, {}); }
    }

    if (u.pathname === '/api/iniciar' && req.method === 'POST') {
      const cfg = await corpo(req);
      if (!cfg.pasta || !cfg.idGaleria || !cfg.alvo || !cfg.lote)
        return json(res, 400, { erro: 'Preencha todos os campos.' });
      try { await contarPasta(cfg.pasta); }
      catch { return json(res, 400, { erro: 'A pasta informada nao existe.' }); }
      await fs.writeFile(CONFIG, JSON.stringify(cfg, null, 2)).catch(() => {});
      try { iniciar(cfg); return json(res, 200, { ok: true }); }
      catch (e) { return json(res, 400, { erro: e.message }); }
    }

    if (u.pathname === '/api/parar' && req.method === 'POST') {
      return json(res, 200, { ok: parar() });
    }

    if (u.pathname === '/api/log') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      linhas.slice(-200).forEach(l => res.write(`data: ${JSON.stringify(l)}\n\n`));
      clientes.push(res);
      req.on('close', () => { clientes = clientes.filter(c => c !== res); });
      return;
    }

    res.writeHead(404); res.end('nao encontrado');
  } catch (e) {
    json(res, 500, { erro: String(e.message || e) });
  }
});

servidor.listen(PORTA, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORTA}`;
  console.log(`\n  Painel do vigia EuCorro rodando em ${url}`);
  console.log('  Deixe esta janela aberta. Para encerrar tudo, feche-a ou aperte Ctrl+C.\n');
  if (!process.env.PAINEL_SEM_ABRIR) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"`
              : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }
});

process.on('SIGINT', () => { parar(); process.exit(0); });
