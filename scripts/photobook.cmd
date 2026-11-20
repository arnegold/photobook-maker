@echo off
rem Runs the photobook engine on Windows:  photobook.cmd <command> [options]
rem First use only: fetches a private copy of Node.js (official build from nodejs.org, checksum-checked) into
rem %LOCALAPPDATA%\photobook-maker\node and installs the engine's parts. No admin rights, no installer, nothing
rem else on the computer changes. Delete that folder to remove it again.
setlocal EnableExtensions
set "ROOT=%~dp0.."
set "ENGINE=%ROOT%\engine"
if not defined PHOTOBOOK_HOME set "PHOTOBOOK_HOME=%LOCALAPPDATA%\photobook-maker"
set "NODEDIR=%PHOTOBOOK_HOME%\node"
set "NODE_LINE=latest-v24.x"

if exist "%NODEDIR%\node.exe" goto have_node
call :install_node
if errorlevel 1 exit /b 1

:have_node
set "PATH=%NODEDIR%;%PATH%"
if exist "%ENGINE%\node_modules\sharp\package.json" if exist "%ENGINE%\node_modules\mupdf\package.json" goto run
echo [photobook] Installing the engine parts (about a minute, only once)... 1>&2
pushd "%ENGINE%"
call "%NODEDIR%\npm.cmd" ci --omit=dev --no-audit --no-fund --loglevel=error 1>&2
set "ERR=%errorlevel%"
popd
if not "%ERR%"=="0" (
  echo [photobook] ERROR: installing the engine parts failed. Check the internet connection and try again. 1>&2
  exit /b 1
)

:run
"%NODEDIR%\node.exe" "%ENGINE%\bin\photobook.mjs" %*
exit /b %errorlevel%

:install_node
set "ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=arm64"
if /i "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "ARCH=arm64"
set "TMPD=%PHOTOBOOK_HOME%\download"
if exist "%TMPD%" rmdir /s /q "%TMPD%"
mkdir "%TMPD%" || goto dl_fail
echo [photobook] Getting Node.js (official build from nodejs.org, about 35 MB, only once)... 1>&2
"%SystemRoot%\System32\curl.exe" -fsSL "https://nodejs.org/dist/%NODE_LINE%/SHASUMS256.txt" -o "%TMPD%\SHASUMS256.txt" || goto dl_fail
set "SUM="
set "FILE="
for /f "tokens=1,2" %%a in ('findstr /l /c:"-win-%ARCH%.zip" "%TMPD%\SHASUMS256.txt"') do (
  set "SUM=%%a"
  set "FILE=%%b"
)
if not defined FILE goto dl_fail
"%SystemRoot%\System32\curl.exe" -fsSL "https://nodejs.org/dist/%NODE_LINE%/%FILE%" -o "%TMPD%\%FILE%" || goto dl_fail
set "GOT="
for /f "skip=1 delims=" %%h in ('certutil -hashfile "%TMPD%\%FILE%" SHA256') do if not defined GOT set "GOT=%%h"
set "GOT=%GOT: =%"
if /i not "%GOT%"=="%SUM%" (
  echo [photobook] ERROR: the Node.js download is damaged ^(checksum mismatch^). Try again later. 1>&2
  exit /b 1
)
"%SystemRoot%\System32\tar.exe" -xf "%TMPD%\%FILE%" -C "%TMPD%" || goto dl_fail
move "%TMPD%\%FILE:.zip=%" "%NODEDIR%" >nul || goto dl_fail
rmdir /s /q "%TMPD%"
echo [photobook] Node.js is ready. 1>&2
exit /b 0

:dl_fail
echo [photobook] ERROR: could not download Node.js from nodejs.org. Check the internet connection and try again. 1>&2
exit /b 1
