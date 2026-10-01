# Vigia EuCorro

Sobe fotos de corrida em massa para o EuCorro sem você ficar na frente do computador.
Você exporta do Lightroom para uma pasta; ele observa a pasta e envia em blocos.

---

## Instalação (uma vez só)

**1. Instale o Node.js.** Baixe a versão **LTS** em https://nodejs.org e instale com as
opções padrão.

**2. Extraia esta pasta na Área de Trabalho.** Deve ficar
`Área de Trabalho\automacao-eucorro` com os arquivos dentro.

**3. Duplo clique em `INICIAR-PAINEL.bat`.** Na primeira vez ele instala sozinho o que
falta — leva alguns minutos e aparece bastante texto na janela preta. É normal.
Quando terminar, o painel abre no navegador.

> **Deixe a janela preta aberta** enquanto estiver usando. Fechar ela encerra o programa.

**4. Entre na sua conta do EuCorro.** No painel, clique em **Carregar galerias**. Abre uma
janela do Chrome pedindo login — faça o login normalmente ali. O programa percebe sozinho
quando você terminar e traz suas provas para o menu. Ele lembra da sua conta daí em diante.

---

## O resto está dentro do painel

A aba **Começar aqui**, no próprio painel, tem o passo a passo completo, as dicas de uso
no dia a dia e o texto de contexto para você continuar evoluindo o programa com o Claude.

---

## Sobre login e senha

O painel não pede sua senha, e isso é de propósito. A sessão fica guardada no perfil do
Chrome desta pasta: você entra uma vez, na janela do próprio EuCorro, e pronto. Guardar
senha em arquivo no computador seria mais risco sem economizar nenhum passo.

---

## Atualizar depois

Duplo clique em **`ATUALIZAR.bat`**. Ele compara a sua versão com a do repositório e baixa
só se houver novidade.

Não encosta no seu histórico de envios, no login salvo nem nas suas configurações, e guarda
a cópia antiga em `versao-anterior/` caso você precise voltar. Se o download falhar no meio,
nada na pasta é alterado.

Projeto: https://github.com/wilson-martinsribeiro/vigia-eucorro

---

## Se o computador não tiver o Google Chrome

Funciona de qualquer jeito. O programa tenta primeiro o Chrome instalado, porque é o
navegador que você já conhece; se não achar, usa o navegador que ele mesmo baixou na
instalação. Nos dois casos a janela abre e o envio acontece igual.

Só se **nenhum dos dois** existir ele para e avisa na tela o que instalar. Nesse caso,
o caminho mais simples é instalar o Chrome em https://www.google.com/chrome e clicar
no `INICIAR-PAINEL.bat` de novo.

---

## Se algo der errado

O log do painel mostra o essencial. O detalhe técnico fica em `diagnostico.log`, nesta
pasta. Mande esse arquivo junto com o que você estava fazendo.

---

## O que foi testado

**Em produção:** 9.993 fotos enviadas para a galeria FURIOSO EXTREMA, zero duplicados,
zero erros, com o Lightroom exportando em paralelo durante parte do envio.

**Automatizado**, 37 verificações contra uma réplica do uploader do EuCorro:

- **Motor (6):** 1.200 fotos com a pasta crescendo durante o envio → cobertura completa
  de 1 a 1.200, zero duplicados · para exato no total pedido e avisa se sobrou arquivo
  na pasta · sem Chrome instalado, cai para o navegador de reserva e conclui · sem
  navegador nenhum, para com mensagem explicando o que instalar
- **Painel (17):** sobe, conta pasta, valida campos, inicia, recusa iniciar duas vezes,
  bloqueia conflito de perfil do navegador, progresso ao vivo, log limpo
- **Parar e retomar (7):** histórico preservado no ponto exato, zero duplicados no fim
- **Navegador (7):** lista galerias pelo navegador de reserva, lê nome e número da prova
  corretamente, avisa no log qual navegador abriu, e traduz a falha para linguagem clara
  na tela em vez de mostrar código de erro

**Ainda não verificado:** se o EuCorro aceita janela oculta — por isso ela vem visível —
e se a tabela de status dele renderiza todas as linhas de um bloco grande de uma vez.
