# Histórico de versões

## 4.2 — 12/10/2026

### Aba "Enviar fotos"

- **Botão "Escolher pasta…"**, ao lado do campo de caminho. Navegador nenhum entrega o
  caminho absoluto de uma pasta escolhida — é trava de segurança, não limitação do código.
  Como o painel tem um servidor na máquina da pessoa, o novo `/api/escolher-pasta` abre um
  `FolderBrowserDialog` via PowerShell e devolve o caminho. Aditivo de propósito: o campo
  de texto continua aceitando o caminho colado, então se a janela falhar nada quebra.
  **Única coisa do projeto entregue sem rodar no ambiente alvo** — o teste aqui é Linux, e
  só o caminho de recusa elegante foi exercitado.
- **Três números abaixo do log:** velocidade de exportação do Lightroom, velocidade de
  upload e estimativa de conclusão em HH:MM:SS, atualizados ao vivo.
  - O vigia passou a imprimir amostras `@@M {json}`, que o painel intercepta e esconde do
    log visível e do `diagnostico.log`.
  - Upload sai dos últimos 5 blocos concluídos; exportação, do crescimento da pasta numa
    **janela móvel** de 5 min — média desde o início fica envenenada para sempre por uma
    pausa no começo, que foi exatamente como eu já errei estimativa neste projeto.
  - A estimativa só aparece **depois do primeiro bloco**; antes disso mostra "calculando".
    Medido no teste: 596 fotos/min contra 600 reais de exportação.

### Aba "Começar aqui"

- "Instalando do zero" reescrito para o fluxo real: baixar pelo link de Releases, extrair,
  Node.js, primeiro login. Mais uma seção "Mantendo atualizado" com o `ATUALIZAR.bat`.
- Bloco de contexto para o Claude atualizado: endereço do repositório, protocolo das
  métricas, o porquê do `/api/escolher-pasta`, códigos de saída e o que segue não testado.
- `COMECE-AQUI.md` e `README.md` atualizados junto — a história da instalação vive em três
  lugares e divergir é como a pessoa acaba lendo instrução de uma versão que não tem.

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
