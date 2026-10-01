@echo off
chcp 65001 >nul
title Vigia EuCorro - painel
cd /d "%~dp0"

rem Se a extracao criou uma pasta dentro da outra, entra nela sozinho
if not exist "painel.mjs" if exist "automacao-eucorro\painel.mjs" cd /d "%~dp0automacao-eucorro"

rem Confere se os arquivos do programa estao todos aqui
set FALTA=
if not exist "painel.mjs"        set FALTA=%FALTA% painel.mjs
if not exist "painel.html"       set FALTA=%FALTA% painel.html
if not exist "vigia-eucorro.mjs" set FALTA=%FALTA% vigia-eucorro.mjs

if not "%FALTA%"=="" (
  echo.
  echo   ==============================================================
  echo      FALTAM ARQUIVOS NESTA PASTA
  echo   ==============================================================
  echo.
  echo   Nao encontrei:%FALTA%
  echo.
  echo   Pasta onde procurei:
  echo   %CD%
  echo.
  echo   O programa precisa destes 4 arquivos JUNTOS na mesma pasta:
  echo       INICIAR-PAINEL.bat
  echo       painel.mjs
  echo       painel.html
  echo       vigia-eucorro.mjs
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
echo   Abrindo o painel no navegador...
echo   Deixe ESTA JANELA ABERTA enquanto usar o painel.
echo.
node painel.mjs

echo.
echo   O painel foi encerrado.
pause
