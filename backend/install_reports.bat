@echo off
echo ========================================
echo Installing Report Generation Dependencies
echo ========================================
echo.

cd /d %~dp0

echo Activating virtual environment...
call .venv\Scripts\activate.bat

echo.
echo Installing dependencies...
pip install reportlab>=4.0.0
pip install weasyprint>=60.0
pip install Pillow>=10.0.0
pip install matplotlib>=3.8.0
pip install Jinja2>=3.1.0
pip install aiofiles>=23.0.0
pip install python-docx>=1.1.0
pip install xlsxwriter>=3.1.0

echo.
echo Creating reports directory structure...
if not exist "reports" mkdir reports
if not exist "reports\pdf" mkdir reports\pdf
if not exist "reports\html" mkdir reports\html
if not exist "reports\excel" mkdir reports\excel
if not exist "reports\json" mkdir reports\json
if not exist "reports\csv" mkdir reports\csv
if not exist "reports\charts" mkdir reports\charts

echo.
echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo Report Generation Module is ready.
echo The system will automatically generate reports after AI analysis completes.
echo.
pause
