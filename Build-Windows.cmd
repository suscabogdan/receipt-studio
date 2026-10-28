@echo off
setlocal
cd /d "%~dp0"
echo Receipt Studio - build Windows installer and portable ZIP
where node >nul 2>nul
if errorlevel 1 goto missing_node
where npm >nul 2>nul
if errorlevel 1 goto missing_node
node -e "const [v,m]=process.versions.node.split('.').map(Number); if(v<22||(v===22&&m<12)){console.error('Use Node.js 22.12 or newer.');process.exit(1);}"
if errorlevel 1 goto failed
if exist "node_modules\.bin\electron-builder.cmd" goto test
echo Installing locked development dependencies. Internet is required.
call npm ci
if errorlevel 1 goto failed
:test
call npm test
if errorlevel 1 goto failed
call npm run package:windows
if errorlevel 1 goto failed
echo.
echo Build complete. The installer and portable ZIP are in the release folder.
pause
exit /b 0
:missing_node
echo Install 64-bit Node.js 22.12 or newer with npm, then run this file again.
:failed
echo.
echo Build failed. Read the error above.
pause
exit /b 1
