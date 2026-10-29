#!/bin/bash

echo "============================================"
echo "WhatsApp Sending Engine - Installation"
echo "============================================"
echo ""

echo "[1/4] Installing Python dependencies..."
pip install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install Python dependencies"
    exit 1
fi
echo "✓ Python dependencies installed"
echo ""

echo "[2/4] Installing Playwright browsers..."
playwright install chromium
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install Playwright browsers"
    exit 1
fi
echo "✓ Playwright browsers installed"
echo ""

echo "[3/4] Creating directories..."
mkdir -p wa_sessions logs
echo "✓ Directories created"
echo ""

echo "[4/4] Verifying installation..."
python -c "import playwright; print('✓ Playwright installed')" || exit 1
python -c "import fastapi; print('✓ FastAPI installed')" || exit 1
python -c "import motor; print('✓ Motor (MongoDB) installed')" || exit 1
echo ""

echo "============================================"
echo "Installation Complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Configure your .env file"
echo "2. Start MongoDB"
echo "3. Run: python -m app.main"
echo ""
echo "For help, see WHATSAPP_SETUP.md"
echo ""
