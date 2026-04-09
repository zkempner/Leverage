@echo off
REM LEVERAGE v3 — Windows Startup Script
REM Run this from the leverage-v3 directory

echo.
echo ====================================================
echo  LEVERAGE v3 — A^&M PEPI Procurement AI Platform
echo ====================================================
echo.

REM Check .env exists
IF NOT EXIST .env (
    echo [ERROR] .env file not found. Copy .env.example to .env and fill in your keys.
    pause
    exit /b 1
)

REM Check ANTHROPIC_API_KEY is set (crude check)
findstr /C:"ANTHROPIC_API_KEY=sk-" .env >nul 2>&1
IF ERRORLEVEL 1 (
    echo [WARN] ANTHROPIC_API_KEY does not look set in .env. Co-pilot and deliverables will fail.
    echo        Add: ANTHROPIC_API_KEY=sk-ant-...
    echo.
)

REM Check node_modules
IF NOT EXIST node_modules (
    echo [INFO] node_modules not found. Running npm install...
    call npm install
    IF ERRORLEVEL 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

REM Create required directories
IF NOT EXIST generated mkdir generated
IF NOT EXIST uploads\contracts mkdir uploads\contracts

echo [INFO] Starting Node.js server on http://localhost:5000 ...
echo [INFO] Starting Python sidecar on http://localhost:5001 ...
echo.
echo  Open your browser to: http://localhost:5000
echo  Client portal at:     http://localhost:5000/#/portal/1
echo  Portfolio dashboard:  http://localhost:5000/#/portfolio
echo.
echo  Press Ctrl+C in either window to stop.
echo ====================================================
echo.

REM Start Python sidecar in a new window
start "LEVERAGE Sidecar" cmd /k "cd /d %~dp0python-sidecar && pip install -r requirements.txt --quiet --break-system-packages 2>nul & python main.py"

REM Start Node server in this window
call npm run dev
