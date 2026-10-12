# Vigia EuCorro

Sobe fotos de corrida em massa para o EuCorro sem você ficar na frente do computador.
Você exporta do Lightroom para uma pasta; ele observa a pasta e envia em blocos.

---

## Instalação (uma vez só)

**1. Instale o Node.js.** Baixe a versão **LTS** em https://nodejs.org e instale com as
opções padrão.

**2. Baixe o programa.** Abra
https://github.com/wilson-martinsribeiro/vigia-eucorro/releases/latest, procure a palavra
**Assets** e clique no arquivo `automacao-eucorro-v4.2.zip`. Esse endereço sempre aponta
para a versão mais nova.

**2b. Extraia na Área de Trabalho.** Botão **direito** no arquivo baixado → **Extrair
Tudo…** → aponte para a Área de Trabalho. Deve ficar `Área de Trabalho\automacao-eucorro`
com os arquivos dentro.

> Abrir o zip com duplo clique e arrastar um arquivo de dentro **não funciona** — precisa
> extrair tudo.

**3. Duplo clique em `INICIAR-PAINEL.bat`.** Na primeira vez ele instala sozinho o que
falta — leva alguns minutos e aparece bastante texto na janela preta. É normal.
Quando terminar, o painel abre no navegador.

> **Deixe a janela preta aberta** enquanto estiver usando. Fechar ela encerra o programa.

**4. Entre na sua conta do EuCorro.** No painel, clique em **Carregar galerias**. Abre uma
janela do Chrome pedindo login — faça o login normalmente ali. O programa percebe sozinho
quando você terminar e traz suas provas para o menu. Ele lembra da sua conta daí em diante.

---

## No dia a dia

1. Clique em **Escolher pasta…** e navegue até a pasta das fotos tratadas. Ele já conta as
   fotos sozinho. Se a janela não abrir, dá para colar o caminho no campo direto.
2. Escolha a prova no menu de galerias.
3. Confira o total esperado e o tamanho do bloco (500 é um bom padrão).
4. Clique em **Iniciar**. Pode sair de perto.

Abaixo do log aparecem três números, medidos durante o envio: a velocidade com que o
Lightroom está **exportando**, a velocidade do **upload** e a **estimativa de conclusão**.
A estimativa só aparece depois do primeiro bloco — antes disso não há dado suficiente e
qualquer número seria chute.

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

Ele precisa ficar **dentro** da pasta `automacao-eucorro`, ao lado do `INICIAR-PAINEL.bat`.
Se estiver em outro lugar — na pasta Downloads, por exemplo — ele avisa na tela e não faz
nada; é só mover e clicar de novo.

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

**Automatizado**, 49 verificações contra uma réplica do uploader do EuCorro:

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

- **Métricas (10):** velocidade de exportação medida em 596 fotos/min contra 600 reais ·
  velocidade de upload medida · estimativa no formato correto, caindo até zero conforme
  avança · exportação marcada como concluída no fim · os dados de medição nunca aparecem
  no log da tela nem sujam o diagnóstico
- **Escolher pasta (8):** responde sem travar, recusa durante um envio, e quando a janela
  não pode abrir a tela ensina a colar o caminho em vez de mostrar erro técnico

**Ainda não verificado:** se o EuCorro aceita janela oculta — por isso ela vem visível;
se a tabela de status dele renderiza todas as linhas de um bloco grande de uma vez; e o
botão **Escolher pasta**, que nunca rodou num Windows real — foi escrito e revisado, mas
o ambiente de teste é Linux. Por isso o campo de texto continua aceitando o caminho colado.
