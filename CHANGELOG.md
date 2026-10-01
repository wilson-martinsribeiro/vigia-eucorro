# Histórico de versões

## 4.1 — 01/10/2026

- **`ATUALIZAR.bat`**: atualiza o programa a partir deste repositório com um duplo clique.
  Compara `VERSAO.txt`, baixa para pasta temporária, confere tamanho e conteúdo dos
  arquivos e só então substitui — se o download falhar, nada é alterado. Guarda a cópia
  anterior em `versao-anterior/`. Nunca toca em histórico de envios, login salvo ou
  configuração.
- **`VERSAO.txt`** para o comparativo de versão.
- README com instalação, atualização e o motivo de o programa rodar local.
- O `.gitignore` garante que perfil do navegador, histórico e configuração não subam.

## 4.0 — 27/09/2026

- **Reserva de navegador.** `channel: 'chrome'` no Playwright não cai para o Chromium
  embutido — falha seco. Uma máquina sem Chrome quebrava mesmo tendo o Chromium baixado
  ao lado. Agora a ordem é: Chrome instalado → Chromium do Playwright → código de saída 4
  com instrução acionável. O painel traduz a falha para linguagem clara na tela e
  reconhece o código 4 no encerramento do processo.
- Correção de redação: a última tentativa dizia "tentando alternativa..." quando não havia
  mais alternativa.
- Suíte nova de 7 testes para o caminho do navegador.

## 3.x — 27/09/2026

- `INICIAR-PAINEL.bat`: corrige a pasta quando a extração aninha `automacao-eucorro/`
  dentro de outra, confere se os 4 arquivos do programa estão juntos antes de rodar, e
  verifica a instalação do Playwright ao final.
- **Bug do caret:** `call npm i playwright@^1.63` virava `playwright@^^1.63` porque o
  `call` do `cmd.exe` reprocessa a linha e duplica o `^`. Resolvido removendo o caret.

## 2.x — 14/09/2026

- Painel local (`127.0.0.1:4599`) com campos de pasta, galeria, total e tamanho do bloco,
  log ao vivo por SSE, e aba **Começar aqui** com onboarding e contexto para o Claude.
- **Campos de login e senha recusados** (pedidos duas vezes). Para funcionarem, teriam que
  guardar a senha em texto puro no disco ou passá-la pelo código até o formulário do
  EuCorro — e não economizariam passo nenhum. No lugar: estado explícito de "aguardando
  login", detecção automática de quando termina, e o passo a passo na própria tela.
- Espera de login que **não** re-navega por cima da digitação da senha.

## 1.x — 13/09/2026

- Motor `vigia-eucorro.mjs`: observa a pasta, envia em blocos, histórico em JSON por nome
  de arquivo, guarda de mtime, fim por `ok + erro == total` com vigia de estagnação.
- Diagnóstico do gargalo: era a ponte remota, não o EuCorro nem a banda. Com o navegador
  na mesma máquina dos arquivos, `setInputFiles` manda só as strings de caminho.
  14,6 fotos/min pela ponte contra ~240/min local.
