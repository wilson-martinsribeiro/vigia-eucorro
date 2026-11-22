// painel.mjs — painel local para o vigia do EuCorro.
// Sobe um servidor em http://127.0.0.1:4599 (so a sua maquina enxerga) e abre o navegador.
//
// NAO guarda login nem senha. A sessao do EuCorro vive no perfil dedicado do Chrome:
// voce loga uma vez na janela e ela persiste entre execucoes.

import http from 'node:http';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { spawn, exec, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI   = path.dirname(fileURLToPath(import.meta.url));
const PORTA  = Number(process.env.PAINEL_PORTA || 4599);
const PERFIL = process.env.VE_PERFIL || path.join(AQUI, 'perfil-chrome');
const CONFIG = path.join(AQUI, 'painel-config.json');

let proc = null;                 // processo do vigia
let linhas = [];                 // ultimas linhas de log
let clientes = [];               // conexoes SSE
let estado = { rodando: false, iniciadoEm: null, ultimoErro: null };
let metricas = [];               // amostras @@M vindas do vigia
let conf = {};                   // painel-config.json carregado em memoria
try { conf = JSON.parse(fss.readFileSync(CONFIG, 'utf8')); } catch {}

// ─── Avisos no celular (ntfy) ────────────────────────────────────────────────
// Escolhido por nao exigir conta nem senha: o nome do topico E a credencial, e
// fica so no painel-config.json desta maquina. Por isso a tela gera um nome
// aleatorio em vez de deixar a pessoa inventar "wilson".
//
// Publicacao em JSON, nao por cabecalho HTTP: cabecalho nao carrega acento, e as
// mensagens sao em portugues.
const NTFY = (process.env.PAINEL_NTFY || 'https://ntfy.sh').replace(/\/+$/, '');
let avisosDados = new Set();     // chaves ja avisadas nesta execucao
let marcoAvisado = null;         // ultimo marco (em fotos) ja avisado
let errosAvisados = 0;           // teto de avisos de bloco com erro
let avisoFalhouNaTela = false;   // so reclama uma vez por execucao
let pedidoParar = false;         // Parar nao e falha: nao avisa

const diag = l => { try { fss.appendFileSync(path.join(AQUI, 'diagnostico.log'), l + '\n'); } catch {} };

async function enviarAviso({ titulo, texto, prioridade = 3, tags = [] }, topico) {
  const t = (topico || conf.avisoTopico || '').trim();
  if (!t) return { erro: 'SEM_TOPICO' };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8_000);
  try {
    const r = await fetch(NTFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: t, title: titulo, message: texto, priority: prioridade, tags }),
      signal: ac.signal,
    });
    if (!r.ok) return { erro: 'HTTP_' + r.status };
    return { ok: true };
  } catch (e) {
    return { erro: (e.message || 'falhou').split('\n')[0] };
  } finally { clearTimeout(timer); }
}

// Dispara e esquece. Um aviso que nao sai NUNCA pode parar 10.000 fotos, entao
// a falha vai para o diagnostico.log e, uma unica vez por execucao, para a tela.
function aviso(chave, msg) {
  if (avisosDados.has(chave)) return;
  avisosDados.add(chave);
  enviarAviso(msg).then(r => {
    if (!r.erro) return;
    diag(`[aviso] ${chave}: ${r.erro}`);
    if (r.erro !== 'SEM_TOPICO' && !avisoFalhouNaTela) {
      avisoFalhouNaTela = true;
      emitir('AVISO: nao consegui mandar a notificacao para o celular. O envio das fotos segue normal.');
    }
  }).catch(() => {});
}


const agora = () => new Date().toISOString().slice(11, 19);

function emitir(linha) {
  const l = `${agora()} ${linha}`;
  linhas.push(l);
  if (linhas.length > 400) linhas = linhas.slice(-400);
  for (const c of clientes) { try { c.write(`data: ${JSON.stringify(l)}\n\n`); } catch {} }
}

// ─── Velocidades e estimativa ────────────────────────────────────────────────
// Tres numeros, cada um com a sua fonte:
//   exportacao — crescimento da pasta ao longo do tempo (janela movel)
//   upload     — fotos por minuto DURANTE os blocos ja concluidos
//   estimativa — o que terminar por ultimo: exportar o que falta, ou subir o que falta
//
// Janela movel de proposito: media desde o inicio fica envenenada para sempre por
// uma pausa no comeco, e foi assim que eu ja errei estimativa neste projeto.
const JANELA_MS = 5 * 60_000;
const hhmmss = ms => {
  const t = Math.max(0, Math.round(ms / 1000));
  return [t/3600, t%3600/60, t%60].map(n => String(Math.floor(n)).padStart(2,'0')).join(':');
};

// A cada N fotos enviadas. Conta pelo TOTAL acumulado, nao por bloco, para
// continuar valendo se o tamanho do bloco mudar. Numa retomada, a base comeca no
// marco ja atingido — senao ele avisaria "1.200 de 9.993" assim que ligasse.
function verificarMarco(m) {
  const passo = Number(estado.cfg?.avisoMarco) || 0;
  if (!passo || typeof m.env !== 'number') return;
  const marco = Math.floor(m.env / passo) * passo;
  if (marcoAvisado === null) { marcoAvisado = marco; return; }
  if (marco <= marcoAvisado) return;
  marcoAvisado = marco;
  const met = calcularMetricas();
  const partes = [`${m.env.toLocaleString('pt-BR')} de ${(m.alvo || 0).toLocaleString('pt-BR')} fotos`];
  if (met.upload > 0) partes.push(`${Math.round(met.upload)} fotos/min`);
  if (met.eta) partes.push(`faltam ${met.eta}`);
  aviso('marco-' + marco, { titulo: 'Vigia EuCorro', texto: partes.join(' · '), tags: ['camera_flash'] });
}

// Linhas do vigia que significam "largue o que esta fazendo e volte ao computador".
function verificarAlerta(l) {
  // Parar a pedido derruba o navegador no meio, e o vigia registra "FALHA:" por
  // causa disso. E consequencia do clique da pessoa, nao problema: avisar aqui
  // seria acordar alguem de madrugada por algo que ela mesma fez.
  if (pedidoParar) return;
  if (/faca o login|faça o login|aguardando ate \d+ min/i.test(l))
    return aviso('login', { prioridade: 5, tags: ['warning'], titulo: 'Precisa de voce',
      texto: 'O EuCorro esta pedindo login. Volte ao computador e faca o login na janela que ja esta aberta.' });
  if (/^FALHA:/.test(l))
    return aviso('falha', { prioridade: 5, tags: ['rotating_light'], titulo: 'O programa parou com falha', texto: l });
  if (/ATENCAO: fechei com/.test(l))
    return aviso('abaixo-do-alvo', { prioridade: 4, tags: ['warning'], titulo: 'Terminou abaixo do alvo', texto: l });
  // Pausa na exportacao: nao e erro, mas a pessoa quer saber que o Lightroom parou
  // — pode ter travado sem ela perceber. Uma vez por pausa, nao uma vez por execucao.
  const pausa = l.match(/exportacao parada .*\(pausa (\d+)\)/);
  if (pausa)
    return aviso('pausa-' + pausa[1], { prioridade: 3, tags: ['hourglass'],
      titulo: 'Exportacao parada', texto: 'Nao entra foto nova na pasta ha alguns minutos. Ja enviei o que tinha e continuo vigiando — se o Lightroom parou, e so retomar.' });

  const bloco = l.match(/bloco (\d+) OK .*erro=([1-9]\d*)/);
  if (bloco && errosAvisados < 3) {
    errosAvisados++;
    aviso('erro-bloco-' + bloco[1], { prioridade: 4, tags: ['rotating_light'],
      titulo: `${bloco[2]} foto(s) com erro`, texto: l });
  }
}

function calcularMetricas() {
  const lote = Number(estado.cfg?.lote) || 0;
  const fim = { exportacao: null, upload: null, eta: null, estadoExport: 'medindo' };
  if (!metricas.length) return fim;

  const ultima = metricas[metricas.length - 1];
  const alvo = ultima.alvo || 0;

  // ── upload: so blocos concluidos, os 5 mais recentes
  const blocos = metricas.filter(m => m.bloco > 0 && m.seg > 0).slice(-5);
  if (blocos.length) {
    const fotos = blocos.reduce((a, m) => a + m.bloco, 0);
    const seg   = blocos.reduce((a, m) => a + m.seg, 0);
    if (seg > 0) fim.upload = fotos / seg * 60;
  }

  // ── exportacao: crescimento da pasta na janela movel
  const agora = ultima.t;
  let janela = metricas.filter(m => typeof m.pasta === 'number' && agora - m.t <= JANELA_MS);
  if (janela.length < 2) janela = metricas.filter(m => typeof m.pasta === 'number');
  if (janela.length >= 2) {
    const a = janela[0], b = janela[janela.length - 1];
    // Precisa de pelo menos 10s entre a primeira e a ultima amostra: abaixo disso o
    // numero oscila demais e a pessoa ve a velocidade pulando sem sentido.
    const ms = b.t - a.t;
    if (ms >= 10_000) fim.exportacao = Math.max(0, (b.pasta - a.pasta) / (ms / 60_000));
  }
  const naPasta = typeof ultima.pasta === 'number' ? ultima.pasta : null;
  if (naPasta !== null && alvo && naPasta >= alvo) { fim.estadoExport = 'concluida'; fim.exportacao = null; }
  else if (fim.exportacao === 0) fim.estadoExport = 'parada';
  else if (fim.exportacao !== null) fim.estadoExport = 'medindo';

  // ── estimativa: so depois do primeiro bloco, senao e chute
  if (fim.upload > 0 && alvo) {
    const faltaSubir = Math.max(0, alvo - ultima.env);
    const tSubir = faltaSubir / fim.upload;                       // minutos
    const faltaExportar = naPasta === null ? 0 : Math.max(0, alvo - naPasta);
    if (faltaExportar > 0 && !(fim.exportacao > 0)) {
      fim.eta = null;                                             // exportacao parada: nao da para prever
    } else {
      const tExportar = faltaExportar > 0 ? faltaExportar / fim.exportacao : 0;
      const ultimoBloco = Math.min(lote || faltaSubir, faltaSubir) / fim.upload;
      fim.eta = hhmmss(Math.max(tSubir, tExportar + ultimoBloco) * 60_000);
    }
  }
  return fim;
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

// ─── Janela nativa para escolher a pasta ─────────────────────────────────────
// O navegador nunca entrega o caminho absoluto de uma pasta escolhida — e trava de
// seguranca, nao limitacao do codigo. Mas este servidor roda na maquina da pessoa,
// entao ELE pode abrir a janela do Windows e devolver o caminho para a tela.
// Em qualquer outro sistema devolve SO_NAO_SUPORTADO e a tela manda colar o caminho.
// Duas tentativas, porque a primeira versao (so WinForms) nao funcionou na maquina
// do Wilson e eu nao tenho Windows para testar. Agora: (1) a janela classica do
// Explorer via COM, que costuma vir para a frente sozinha; (2) o FolderBrowserDialog
// do WinForms. E o erro de verdade vai para o diagnostico.log — antes ele so aparecia
// na tela e sumia, entao nao dava para diagnosticar nada.
const PS_COM = [
  "$ErrorActionPreference = 'Stop'",
  "$sh = New-Object -ComObject Shell.Application",
  "$f = $sh.BrowseForFolder(0, 'Escolha a pasta das fotos tratadas', 0)",
  "if ($f -ne $null) { Write-Output $f.Self.Path }",
].join('; ');

const PS_FORMS = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.Windows.Forms',
  '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
  "$d.Description = 'Escolha a pasta das fotos tratadas'",
  '$d.ShowNewFolderButton = $false',
  '$t = New-Object System.Windows.Forms.Form',
  '$t.TopMost = $true',
  'if ($d.ShowDialog($t) -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }',
  '$t.Dispose()',
].join('; ');

function rodarPowerShell(script) {
  return new Promise(resolve => {
    execFile('powershell.exe', ['-NoProfile', '-STA', '-Command', script],
      { timeout: 5 * 60_000 },        // sem windowsHide: suspeito de atrapalhar a janela
      (err, stdout, stderr) => {
        if (err && err.killed) return resolve({ erro: 'TEMPO_ESGOTADO' });
        if (err) return resolve({ erro: 'falhou', detalhe: ((stderr || '') + ' ' + (err.message || '')).trim().split('\n')[0].slice(0, 300) });
        const caminho = String(stdout || '').trim();
        resolve(caminho ? { pasta: caminho } : { cancelado: true });
      });
  });
}

async function escolherPasta() {
  if (process.platform !== 'win32') return { erro: 'SO_NAO_SUPORTADO' };
  const tentativas = [['janela do Explorer', PS_COM], ['FolderBrowserDialog', PS_FORMS]];
  const problemas = [];
  for (const [nome, script] of tentativas) {
    const r = await rodarPowerShell(script);
    if (r.pasta || r.cancelado || r.erro === 'TEMPO_ESGOTADO') {
      if (r.pasta) diag(`[pasta] escolhida pela ${nome}`);
      return r;
    }
    problemas.push(`${nome}: ${r.detalhe || r.erro}`);
    diag(`[pasta] ${nome} falhou -> ${r.detalhe || r.erro}`);
  }
  emitir('Nao consegui abrir a janela de pastas. O detalhe tecnico foi para o diagnostico.log.');
  return { erro: 'SEM_DIALOGO', detalhe: problemas.join(' | ').slice(0, 400) };
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
  if (process.env.VE_ESPERA_LOGIN) env.VE_ESPERA_LOGIN = process.env.VE_ESPERA_LOGIN;

  linhas = [];
  metricas = [];
  avisosDados = new Set(); marcoAvisado = null; errosAvisados = 0;
  avisoFalhouNaTela = false; pedidoParar = false;
  emitir(`Iniciando: ${cfg.alvo} fotos, blocos de ${cfg.lote}, galeria ${cfg.idGaleria}`);
  emitir(`Pasta: ${cfg.pasta}`);

  proc = spawn(process.execPath, [path.join(AQUI, 'vigia-eucorro.mjs')], { env, cwd: AQUI });
  estado = { rodando: true, iniciadoEm: new Date().toISOString(), ultimoErro: null, cfg };
  // Prioridade baixa (sem som): serve de confirmacao de que o canal funciona
  // NESTA execucao, antes da pessoa sair de perto.
  aviso('inicio', { prioridade: 2, tags: ['camera'], titulo: 'Envio iniciado',
    texto: `Alvo de ${Number(cfg.alvo).toLocaleString('pt-BR')} fotos, em blocos de ${cfg.lote}.` });

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
        const limpa = l.replace(/\x1b\[\d+m/g, '').replace(/^\d\d:\d\d:\d\d /, '');
        // Amostras de medicao: alimentam os numeros, nunca aparecem no log da tela
        // nem sujam o diagnostico.log.
        if (limpa.startsWith('@@M ')) {
          try {
            const m = JSON.parse(limpa.slice(4));
            metricas.push(m);
            if (metricas.length > 400) metricas = metricas.slice(-400);
            verificarMarco(m);
          } catch {}
          continue;
        }
        bruto.write(l + '\n');
        if (!ruido(limpa)) { emitir(limpa); verificarAlerta(limpa); }
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

    // Parar a pedido nao e falha — nao incomoda ninguem no celular.
    if (!pedidoParar) {
      const ult = metricas[metricas.length - 1] || {};
      const env = Number(ult.env) || 0;
      if (code === 0)
        aviso('fim-ok', { tags: ['white_check_mark'], titulo: 'Upload concluido',
          texto: `${env.toLocaleString('pt-BR')} fotos enviadas com sucesso.` });
      else if (code === 2)
        aviso('fim-login', { prioridade: 5, tags: ['warning'], titulo: 'Precisa de voce',
          texto: 'O programa parou: e preciso fazer o login do EuCorro na janela do navegador.' });
      else if (code === 4)
        aviso('fim-navegador', { prioridade: 5, tags: ['warning'], titulo: 'Precisa de voce',
          texto: 'Nenhum navegador encontrado neste computador. Instale o Google Chrome e rode de novo.' });
      else
        aviso('fim-' + code, { prioridade: 4, tags: ['warning'], titulo: 'O programa encerrou',
          texto: `Encerrou com codigo ${code}, em ${env.toLocaleString('pt-BR')} fotos. Veja o painel.` });
    }
  });
  return true;
}

function parar() {
  if (!proc) return false;
  pedidoParar = true;
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
      return json(res, 200, { ...estado, enviadas, metricas: calcularMetricas(), linhas: linhas.slice(-200) });
    }

    if (u.pathname === '/api/contar') {
      const pasta = u.searchParams.get('pasta') || '';
      try { return json(res, 200, { total: await contarPasta(pasta) }); }
      catch (e) { return json(res, 400, { erro: 'Pasta nao encontrada' }); }
    }

    // Guarda so os ajustes de aviso, sem precisar iniciar um envio.
    if (u.pathname === '/api/config' && req.method === 'POST') {
      const c = await corpo(req);
      if ('avisoTopico' in c) conf.avisoTopico = String(c.avisoTopico || '').trim();
      if ('avisoMarco'  in c) conf.avisoMarco  = Number(c.avisoMarco) || 0;
      await fs.writeFile(CONFIG, JSON.stringify(conf, null, 2)).catch(() => {});
      return json(res, 200, { ok: true });
    }

    // Botao "Testar aviso": sem isso a pessoa sai de perto confiando num canal
    // que nunca viu funcionar.
    if (u.pathname === '/api/testar-aviso' && req.method === 'POST') {
      const c = await corpo(req);
      const r = await enviarAviso({ prioridade: 3, tags: ['bell'], titulo: 'Teste do Vigia EuCorro',
        texto: 'Se voce esta lendo isto no celular, os avisos estao funcionando.' }, c.topico);
      return json(res, r.ok ? 200 : 400, r);
    }

    if (u.pathname === '/api/escolher-pasta') {
      if (proc) return json(res, 400, { erro: 'OCUPADO' });
      return json(res, 200, await escolherPasta());
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
      conf = { ...conf, ...cfg };
      await fs.writeFile(CONFIG, JSON.stringify(conf, null, 2)).catch(() => {});
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
