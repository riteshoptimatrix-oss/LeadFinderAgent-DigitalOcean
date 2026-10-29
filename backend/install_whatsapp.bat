@echo off
echo ============================================
echo WhatsApp Sending Engine - Installation
echo ============================================
echo.

echo [1/4] Installing Python dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install Python dependencies
    pause
    exit /b 1
)
echo ✓ Python dependencies installed
echo.

echo [2/4] Installing Playwright browsers...
playwright install chromium
if errorlevel 1 (
    echo ERROR: Failed to install Playwright browsers
    pause
    exit /b 1
)
echo ✓ Playwright browsers installed
echo.

echo [3/4] Creating directories...
if not exist "wa_sessions" mkdir wa_sessions
if not exist "logs" mkdir logs
echo ✓ Directories created
echo.

echo [4/4] Verifying installation...
python -c "import playwright; print('✓ Playwright installed')"
python -c "import fastapi; print('✓ FastAPI installed')"
python -c "import motor; print('✓ Motor (MongoDB) installed')"
echo.

echo ============================================
echo Installation Complete!
echo ============================================
echo.
echo Next steps:
echo 1. Configure your .env file
echo 2. Start MongoDB
echo 3. Run: python -m app.main
echo.
echo For help, see WHATSAPP_SETUP.md
echo.
pause
