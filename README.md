# Vigia EuCorro

Sobe fotos de corrida em massa para o **eucorro.com** sem você ficar na frente do
computador. Você exporta do Lightroom para uma pasta; o programa observa a pasta e envia
em blocos até bater o total esperado. Se cair no meio, retoma de onde parou sem repetir
nenhuma foto.

**Validado em produção:** 9.993 fotos numa galeria, zero duplicados, zero erros — com o
Lightroom ainda exportando em paralelo durante parte do envio.

---

## Por que roda no seu computador, e não num site

O envio só é rápido se o navegador estiver na **mesma máquina das fotos**. Assim o
programa entrega ao EuCorro apenas os *caminhos* dos arquivos, e os gigabytes não
atravessam servidor nenhum.

Uma versão hospedada na nuvem teria que subir cada foto duas vezes — do seu PC para o
servidor, e do servidor para o EuCorro. Medido: **14,6 fotos/min** por uma ponte remota
contra **~240 fotos/min** rodando local.

Por isso não existe endereço para acessar. Este repositório serve para **guardar,
distribuir e atualizar** o programa — não para executá-lo.

---

## Instalar (uma vez só)

1. Instale o **Node.js LTS**: https://nodejs.org
2. Baixe este projeto: botão verde **Code** → **Download ZIP**
3. **Extraia tudo** na Área de Trabalho (botão direito no ZIP → Extrair Tudo).
   Abrir o ZIP e arrastar um arquivo de dentro **não funciona**.
4. Duplo clique em **`INICIAR-PAINEL.bat`**

Na primeira vez ele instala sozinho o que falta — alguns minutos, com bastante texto na
janela preta. É normal. Depois o painel abre no navegador.

> **Deixe a janela preta aberta** enquanto usar. Fechá-la encerra o programa.

No painel, clique em **Carregar galerias**: abre uma janela pedindo o login do EuCorro.
Faça o login ali uma vez — o programa percebe sozinho quando terminar e lembra da conta
daí em diante.

## Atualizar

Duplo clique em **`ATUALIZAR.bat`**. Ele compara sua versão com a daqui e baixa só se
houver novidade.

Não encosta no seu histórico de envios, no login salvo nem nas suas configurações, e
guarda a cópia antiga em `versao-anterior/` caso você precise voltar.

---

## Os arquivos

| Arquivo | Para que serve |
|---|---|
| `INICIAR-PAINEL.bat` | Duplo clique. Instala o necessário na 1ª vez e abre o painel. |
| `ATUALIZAR.bat` | Duplo clique. Baixa a versão nova daqui. |
| `COMECE-AQUI.md` | O passo a passo em texto. |
| `painel.html` | A tela: aba **Enviar fotos** e aba **Começar aqui**. |
| `painel.mjs` | Servidor local em `127.0.0.1:4599`. Lista galerias, inicia e para o envio, mostra o log ao vivo. |
| `vigia-eucorro.mjs` | O motor. Observa a pasta e envia de N em N. |
| `VERSAO.txt` | Versão instalada. O `ATUALIZAR.bat` usa isto para comparar. |
| `testes/` | As suítes automatizadas. Não é necessário para usar. |

### O que fica só na sua máquina

Nada disto sobe para o repositório, por regra no `.gitignore`:

`perfil-chrome/` (sua sessão do EuCorro) · `ledger-*.json` (histórico de fotos enviadas) ·
`painel-config.json` (suas pastas e galerias) · `diagnostico.log` · `node_modules/`

---

## Sobre login e senha

O painel **não pede sua senha**, de propósito. A sessão fica no perfil de navegador desta
pasta: você entra uma vez, na janela do próprio EuCorro. Guardar senha em arquivo no
computador seria mais risco sem economizar passo nenhum — você digitaria a senha de
qualquer forma, só numa caixa a mais.

## Se o computador não tiver o Google Chrome

Funciona de qualquer jeito. A ordem é:

1. Chrome instalado (é o navegador que a pessoa reconhece)
2. Chromium que o Playwright baixa na instalação
3. Nenhum dos dois → o programa **para e diz o que instalar**, em vez de dar erro técnico

---

## Salvaguardas do motor

| Risco | Como está tratado |
|---|---|
| Pegar arquivo que o Lightroom ainda está gravando | Só entra se o arquivo está parado há 8s |
| Queda no meio da madrugada | Histórico em JSON por nome de arquivo; reinício retoma exato |
| Reenviar foto repetida | O EuCorro deduplica; duplicata conta como resolvida |
| Sessão expirada | Espera até 15 min pelo login, **sem re-navegar por cima da digitação** |
| Um erro travar a espera | Fim é `ok + erro == total`, com vigia de estagnação |
| O site mudar a palavra de status | Reconhecimento por exclusão, não por lista de sinônimos |
| Pasta com mais arquivos que o esperado | Para exato no total pedido e avisa da sobra |
| Perfil de navegador ocupado | O painel bloqueia "carregar galerias" com o envio rodando |
| Máquina sem Chrome | Cai para o Chromium; sem nenhum, sai com código 4 explicando |

## Testes

**37 verificações automatizadas**, todas passando, rodadas contra os arquivos extraídos do
pacote de distribuição — não contra a cópia de trabalho. Playwright real contra uma
réplica do uploader do EuCorro (fila que **substitui** a cada seleção, status
`enviando → processando → sucesso`, deduplicação do servidor).

- **Motor (6)** — 1.200 fotos com a pasta crescendo durante o envio → cobertura 1 a 1.200
  completa, zero duplicados · para exato no total e avisa da sobra · sem Chrome, cai para
  a reserva e conclui · sem navegador nenhum, sai com código 4 e mensagem útil
- **Painel (17)** — sobe, conta pasta, valida campos, inicia, recusa iniciar duas vezes,
  bloqueia conflito de perfil, progresso ao vivo, log limpo
- **Parar e retomar (7)** — histórico preservado no ponto exato, zero duplicados no fim
- **Navegador (7)** — lista galerias pela reserva, lê nome e número da prova, avisa no log
  qual navegador abriu, traduz a falha na tela

Para rodar: `cd testes` e `node teste-painel.mjs` (precisa de `playwright` instalado e,
no Linux, de `xvfb-run`).

**Ainda não verificado:** se o EuCorro tolera janela oculta (hoje roda visível, que é o
seguro) e se a tabela de status é virtualizada em blocos grandes. Os dois `.bat` são
conferidos por um lint dos erros clássicos de `cmd.exe`, mas não executados em CI — não
há Windows no ambiente de teste.

---

## Para continuar o desenvolvimento com o Claude

A aba **Começar aqui** do painel tem um bloco de contexto com botão de copiar: cole num
chat novo e o Claude entende o projeto inteiro sem explicação. O `CHANGELOG.md` guarda o
histórico de decisões.

Configuração por variável de ambiente (o painel preenche sozinho, mas dá para rodar o
motor na mão):

| Variável | Para que |
|---|---|
| `VE_PASTA` | Pasta das fotos tratadas |
| `VE_ID` | ID da galeria no EuCorro |
| `VE_ALVO` | Total esperado de fotos |
| `VE_LOTE` | Tamanho do bloco de envio |
| `VE_CANAL` | `chrome` (padrão) ou `chromium` para forçar a reserva |
| `VE_HEADLESS` | `false` (padrão) — janela visível |
| `VE_PERFIL`, `VE_LEDGER` | Caminhos; o padrão é ao lado do script |
| `VE_SETTLE`, `VE_POLL`, `VE_STALL` | Tempos em ms, úteis nos testes |

Códigos de saída: `0` tudo certo · `2` precisa fazer login · `3` falta configuração ·
`4` nenhum navegador disponível.

---

## Uso

Ferramenta interna da **Anissa Kaori Fotografia**. Publicada aberta para facilitar a
distribuição e a atualização entre os computadores de casa — não é um produto com suporte.
