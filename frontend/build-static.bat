@echo off
REM ============================================
REM Build Static Export (generates /out folder)
REM ============================================

echo.
echo ========================================
echo  Building Static Export (out folder)
echo ========================================
echo.

cd /d "%~dp0"

echo [Step 1/4] Backing up current config...
if exist "next.config.ts" (
    copy /Y "next.config.ts" "next.config.backup.ts" >nul
    echo   ✓ Current config backed up
) else (
    echo   ! No config to backup
)

echo.
echo [Step 2/4] Switching to static export config...
copy /Y "next.config.static.ts" "next.config.ts" >nul
echo   ✓ Static export config activated

echo.
echo [Step 3/4] Building...
call npm run build
if errorlevel 1 (
    echo   ✗ Build failed!
    
    echo.
    echo [Step 4/4] Restoring original config...
    if exist "next.config.backup.ts" (
        copy /Y "next.config.backup.ts" "next.config.ts" >nul
        del "next.config.backup.ts"
        echo   ✓ Config restored
    )
    
    pause
    exit /b 1
)
echo   ✓ Build successful

echo.
echo [Step 4/4] Restoring original config...
if exist "next.config.backup.ts" (
    copy /Y "next.config.backup.ts" "next.config.ts" >nul
    del "next.config.backup.ts"
    echo   ✓ Config restored
)

echo.
echo ========================================
echo  Static export complete!
echo ========================================
echo.
echo Output location: %cd%\out
echo.
echo The /out folder contains:
dir /b out 2>nul
echo.
echo You can now:
echo   1. Upload the /out folder to any static host
echo   2. Serve it with a web server
echo   3. Deploy to CDN
echo.

pause
