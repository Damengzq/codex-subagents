@echo off
cd /d D:\zz\codex\hardware-wiki

REM Find LAN IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr "192.168" ^| findstr /v "255.255"') do set IP=%%a
set IP=%IP: =%

echo.
echo  ========================================
echo    Hardware Documentation Wiki
echo  ========================================
echo    Local:   http://localhost:3000
echo    LAN:     http://%IP%:3000
echo  ========================================
echo.
echo  Starting ngrok public tunnel...
start "ngrok" /min D:\zz\codex\hardware-wiki\ngrok.exe http 3000 --log=stdout
timeout /t 3 >nul
echo.
echo  Starting Wiki server...
node server.mjs
pause
