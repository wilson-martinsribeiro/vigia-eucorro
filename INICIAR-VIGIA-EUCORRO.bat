@echo off
chcp 65001 >nul
title Vigia EuCorro
cd /d "%~dp0"

rem Se a extracao criou uma pasta dentro da outra, entra nela sozinho
if not exist "programa\painel.mjs" if exist "automacao-eucorro\programa\painel.mjs" cd /d "%~dp0automacao-eucorro"

if not exist "programa\painel.mjs" (
  echo.
  echo   ==============================================================
  echo      FALTAM ARQUIVOS NESTA PASTA
  echo   ==============================================================
  echo.
  echo   Nao encontrei a pasta "programa" ao lado deste arquivo.
  echo.
  echo   Pasta onde procurei:
  echo   %CD%
  echo.
  echo   COMO RESOLVER
  echo   1^) Apague a pasta automacao-eucorro da Area de Trabalho
  echo   2^) Clique com o BOTAO DIREITO no arquivo automacao-eucorro.zip
  echo   3^) Escolha "Extrair Tudo..."
  echo   4^) Aponte para a Area de Trabalho e confirme
  echo   5^) Abra a pasta que apareceu e clique neste arquivo de novo
  echo.
  echo   Obs: abrir o ZIP com duplo clique e arrastar so um arquivo
  echo   para fora NAO funciona - precisa extrair tudo.
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   O Node.js nao foi encontrado neste computador.
  echo   Instale a versao LTS em https://nodejs.org
  echo   Depois feche esta janela e clique neste arquivo de novo.
  echo.
  pause
  exit /b 1
)

rem Instalacao antiga, com tudo solto na raiz? Organiza uma vez so.
rem A logica fica em Node, nao aqui: mexer nos dados da pessoa (ledger, login)
rem precisa de algo que eu consiga testar de verdade.
node "programa\migrar.mjs"

cd /d "%CD%\programa"

if not exist "node_modules\playwright" (
  echo.
  echo   Primeira vez neste computador: instalando o que falta.
  echo   Isso leva alguns minutos e mostra muito texto. E normal.
  echo.
  call npm init -y >nul 2>nul
  call npm i playwright
  call npx playwright install chromium
  echo.
  echo   Instalacao concluida.
  echo.
)

if not exist "node_modules\playwright" (
  echo.
  echo   A instalacao do Playwright nao foi concluida.
  echo   Verifique a conexao com a internet e tente de novo.
  echo.
  pause
  exit /b 1
)

echo.
echo   Abrindo o Vigia EuCorro no navegador...
echo   Deixe ESTA JANELA ABERTA enquanto o envio estiver rodando.
echo.
node painel.mjs

echo.
echo   O Vigia EuCorro foi encerrado.
pause
