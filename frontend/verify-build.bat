@echo off
REM ============================================
REM Verify Static Export Build
REM ============================================

echo.
echo ========================================
echo  Verifying Static Export Configuration
echo ========================================
echo.

cd /d "%~dp0"

echo [Step 1/5] Checking next.config.ts...
findstr /C:"output: \"export\"" next.config.ts >nul
if errorlevel 1 (
    echo   ✗ ERROR: output: "export" not found in next.config.ts
    echo   The configuration is incorrect.
    pause
    exit /b 1
) else (
    echo   ✓ Configuration correct: output: "export" found
)

echo.
echo [Step 2/5] Cleaning previous builds...
if exist ".next" (
    rmdir /s /q .next
    echo   ✓ Removed .next directory
)
if exist "out" (
    rmdir /s /q out
    echo   ✓ Removed old out directory
)

echo.
echo [Step 3/5] Running build...
call npm run build
if errorlevel 1 (
    echo.
    echo   ✗ Build failed! Check errors above.
    pause
    exit /b 1
)
echo   ✓ Build completed successfully

echo.
echo [Step 4/5] Checking for out folder...
if not exist "out" (
    echo   ✗ ERROR: out folder was NOT created
    echo   Something went wrong during the build.
    pause
    exit /b 1
) else (
    echo   ✓ out folder created successfully
)

echo.
echo [Step 5/5] Verifying out folder contents...
dir /b out >nul 2>&1
if errorlevel 1 (
    echo   ✗ WARNING: out folder is empty
) else (
    echo   ✓ out folder contains files:
    echo.
    dir /b out
    echo.
    echo   Details:
    for /f %%A in ('dir /s /b out\*.html 2^>nul ^| find /c /v ""') do echo     - %%A HTML files
    for /f %%A in ('dir /s /b out\*.js 2^>nul ^| find /c /v ""') do echo     - %%A JavaScript files
    for /f %%A in ('dir /s /b out\*.css 2^>nul ^| find /c /v ""') do echo     - %%A CSS files
)

echo.
echo ========================================
echo  Verification Complete!
echo ========================================
echo.
echo Location: %cd%\out
echo.
echo You can now:
echo   1. Test locally: cd out ^&^& python -m http.server 3000
echo   2. Upload to static hosting (S3, CDN, Apache, etc.)
echo   3. Deploy to any static file server
echo.

pause
