@echo off
cd /d "%~dp0"

echo ========================================
echo   Gateway + Wiki via Proxy (port 8088)
echo ========================================

set OPENAI_API_KEY=sk-c1bc1051404a48a58ea6537abf9ee28f
set FEISHU_APP_SECRET=LMolbdeWFTW6X7vpAh20MgwokJhRLiM8
set HTTP_PROXY=http://127.0.0.1:7897
set HTTPS_PROXY=http://127.0.0.1:7897
set NO_PROXY=localhost,127.0.0.1
set PYTHONUNBUFFERED=1

set PY=D:\software\ESP32\Espressif\python_env\idf5.5_py3.11_env\Scripts\python.exe
set NODE=C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe

echo [1/4] Hardware Wiki (3000)...
start "Wiki" /D D:\zz\codex\hardware-wiki "%NODE%" server.mjs
timeout /t 3 /nobreak >nul

echo [2/4] Flask Gateway (5678)...
start "" /B "%PY%" server.py
timeout /t 3 /nobreak >nul

echo [3/4] Reverse Proxy (8088)...
start "" /B "%PY%" proxy.py
timeout /t 2 /nobreak >nul

echo [4/4] ngrok -^> 8088...
set HTTP_PROXY=
set HTTPS_PROXY=
start "ngrok" ngrok.exe http 8088

timeout /t 5 /nobreak
echo.
echo ========================================
echo   https://haywood-nondenunciative-panickingly.ngrok-free.dev
echo   /feishu/event -^> Flask  :5678
echo   /*            -^> Wiki   :3000
echo ========================================
pause
