@echo off
REM ============================================
REM Build for Netlify (full Next.js runtime)
REM ============================================

echo.
echo ========================================
echo  Building for Netlify (full runtime)
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
echo [Step 2/4] Switching to Netlify config...
copy /Y "next.config.netlify.ts" "next.config.ts" >nul
echo   ✓ Netlify config activated

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
echo [Step 4/4] Config remains as Netlify (for deployment)...
del "next.config.backup.ts" >nul 2>&1
echo   ✓ Ready for Netlify deployment

echo.
echo ========================================
echo  Netlify build complete!
echo ========================================
echo.
echo Output location: %cd%\.next
echo.
echo The /.next folder contains:
dir /b .next 2>nul | findstr /v "node_modules"
echo.
echo You can now:
echo   1. Test locally: npm start
echo   2. Deploy to Netlify: git push
echo   3. Full Next.js features enabled
echo.

pause
