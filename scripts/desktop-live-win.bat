@echo off
setlocal

set "ROOT_DIR=%~dp0.."
pushd "%ROOT_DIR%"

echo [GAA Live Desktop] Starting live desktop mode...
echo [GAA Live Desktop] Keep this window open while testing.
echo.

call npm run dev:win:desktop
set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo [GAA Live Desktop] Session ended with code %EXIT_CODE%.
echo [GAA Live Desktop] Press any key to close this window.
pause >nul

popd
exit /b %EXIT_CODE%
