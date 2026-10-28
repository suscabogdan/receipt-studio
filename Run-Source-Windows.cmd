@echo off
setlocal
cd /d "%~dp0"
echo Receipt Studio - source mode
where node >nul 2>nul
if errorlevel 1 goto missing_node
where npm >nul 2>nul
if errorlevel 1 goto missing_node
node -e "const [v,m]=process.versions.node.split('.').map(Number); if(v<22||(v===22&&m<12)){console.error('Use Node.js 22.12 or newer.');process.exit(1);}"
if errorlevel 1 goto failed
if exist "node_modules\electron\dist\electron.exe" goto run
echo Installing locked development dependencies. Internet is required.
call npm ci
if errorlevel 1 goto failed
:run
call npm start
if errorlevel 1 goto failed
exit /b 0
:missing_node
echo Install 64-bit Node.js 22.12 or newer with npm, then run this file again.
echo Alternatively, Start-Windows.cmd runs source without a Node.js install.
:failed
echo.
echo The app did not start successfully. Read the error above.
pause
exit /b 1
