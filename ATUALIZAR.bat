@echo off
chcp 65001 >nul
title Vigia EuCorro - atualizar
cd /d "%~dp0"

rem Se a extracao criou uma pasta dentro da outra, entra nela sozinho
if not exist "painel.mjs" if exist "automacao-eucorro\painel.mjs" cd /d "%~dp0automacao-eucorro"

set REPO=https://raw.githubusercontent.com/wilsonribeiro-91/vigia-eucorro/main
set TMPD=%TEMP%\vigia-eucorro-update

echo.
echo   ==============================================================
echo      ATUALIZAR O VIGIA EUCORRO
echo   ==============================================================
echo.
echo   Isto baixa a versao mais nova do programa.
echo.
echo   NAO mexe no seu historico de envios, no seu login salvo
echo   nem nas suas configuracoes. Sua copia antiga fica guardada
echo   na pasta versao-anterior, caso precise voltar.
echo.

where curl >nul 2>nul
if errorlevel 1 (
  echo   Este Windows nao tem o comando curl, necessario para baixar.
  echo   Baixe o ZIP novo direto da pagina do projeto:
  echo   https://github.com/wilsonribeiro-91/vigia-eucorro
  echo.
  pause
  exit /b 1
)

if exist "%TMPD%" rd /s /q "%TMPD%"
mkdir "%TMPD%" 2>nul

echo   Consultando o repositorio...
curl -fsSL "%REPO%/VERSAO.txt" -o "%TMPD%\VERSAO.txt"
if errorlevel 1 (
  echo.
  echo   Nao consegui falar com o repositorio.
  echo   Verifique a conexao com a internet e tente de novo.
  echo.
  pause
  exit /b 1
)

set NOVA=
for /f "usebackq delims=" %%v in ("%TMPD%\VERSAO.txt") do set NOVA=%%v
set ATUAL=desconhecida
if exist "VERSAO.txt" for /f "usebackq delims=" %%v in ("VERSAO.txt") do set ATUAL=%%v

echo.
echo   Versao nesta pasta ....... %ATUAL%
echo   Versao no repositorio .... %NOVA%
echo.

if "%ATUAL%"=="%NOVA%" (
  echo   Voce ja esta na versao mais nova. Nada a fazer.
  echo.
  pause
  exit /b 0
)

echo   Baixando os arquivos...
for %%f in (vigia-eucorro.mjs painel.mjs painel.html COMECE-AQUI.md INICIAR-PAINEL.bat) do (
  curl -fsSL "%REPO%/%%f" -o "%TMPD%\%%f"
  if errorlevel 1 goto :falhou
  echo       %%f
)

echo.
echo   Conferindo o que foi baixado...
for %%f in ("%TMPD%\vigia-eucorro.mjs" "%TMPD%\painel.mjs" "%TMPD%\painel.html" "%TMPD%\COMECE-AQUI.md" "%TMPD%\INICIAR-PAINEL.bat") do (
  if not exist %%f goto :falhou
  if %%~zf LSS 500 goto :falhou
)
findstr /c:"abrirNavegador" "%TMPD%\vigia-eucorro.mjs" >nul
if errorlevel 1 goto :falhou
findstr /c:"createServer" "%TMPD%\painel.mjs" >nul
if errorlevel 1 goto :falhou
echo       tudo certo.

if not exist "versao-anterior" mkdir "versao-anterior"
for %%f in (vigia-eucorro.mjs painel.mjs painel.html COMECE-AQUI.md INICIAR-PAINEL.bat VERSAO.txt) do (
  if exist "%%f" copy /y "%%f" "versao-anterior\%%f" >nul
)

for %%f in (vigia-eucorro.mjs painel.mjs painel.html COMECE-AQUI.md INICIAR-PAINEL.bat) do (
  copy /y "%TMPD%\%%f" "%%f" >nul
  if errorlevel 1 goto :falhou
)
copy /y "%TMPD%\VERSAO.txt" "VERSAO.txt" >nul

rd /s /q "%TMPD%" 2>nul

echo.
echo   ==============================================================
echo      ATUALIZADO: %ATUAL%  --^>  %NOVA%
echo   ==============================================================
echo.
echo   Agora clique em INICIAR-PAINEL.bat para usar.
echo.
echo   Obs: se esta versao trouxer um ATUALIZAR.bat novo, ele nao se
echo   substitui sozinho por seguranca. Quando for o caso, o aviso
echo   aparece na pagina do projeto.
echo.
pause
exit /b 0

:falhou
echo.
echo   O download nao veio completo. NADA foi alterado na sua pasta.
echo   Tente de novo mais tarde, ou baixe o ZIP em:
echo   https://github.com/wilsonribeiro-91/vigia-eucorro
echo.
rd /s /q "%TMPD%" 2>nul
pause
exit /b 1
