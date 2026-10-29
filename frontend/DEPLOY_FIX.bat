@echo off
REM ============================================
REM Quick Fix Deployment Script for Windows
REM Fixes Next.js RSC 404 errors on Netlify
REM ============================================

echo.
echo ========================================
echo  Next.js RSC 404 Fix - Deployment
echo ========================================
echo.

cd /d "%~dp0"

echo [Step 1/5] Cleaning build artifacts...
if exist ".next" rmdir /s /q .next
if exist "out" rmdir /s /q out
echo   ✓ Build artifacts cleaned

echo.
echo [Step 2/5] Testing local build...
call npm run build
if errorlevel 1 (
    echo   ✗ Build failed! Fix errors before deploying.
    pause
    exit /b 1
)
echo   ✓ Build successful

echo.
echo [Step 3/5] Staging changes...
git add next.config.ts netlify.toml NETLIFY_RSC_FIX.md DEPLOY_FIX.bat
echo   ✓ Files staged

echo.
echo [Step 4/5] Committing fix...
git commit -m "fix: remove static export to enable RSC and server features"
if errorlevel 1 (
    echo   ! No changes to commit or commit failed
)
echo   ✓ Changes committed

echo.
echo [Step 5/5] Pushing to trigger deployment...
git push origin main
if errorlevel 1 (
    echo   ✗ Push failed! Check your git remote configuration.
    pause
    exit /b 1
)
echo   ✓ Changes pushed

echo.
echo ========================================
echo  Deployment triggered successfully!
echo ========================================
echo.
echo Next steps:
echo   1. Go to your Netlify dashboard
echo   2. Monitor the deployment
echo   3. After deploy, clear browser cache (Ctrl+Shift+Delete)
echo   4. Test your app - RSC 404 errors should be gone!
echo.
echo Full guide: See NETLIFY_RSC_FIX.md
echo.

pause
