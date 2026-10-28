@echo off
setlocal
set "RECEIPT_STUDIO_DIR=%~dp0"
echo Receipt Studio
echo First launch downloads Electron from its official GitHub release.
echo Later launches use the saved runtime and work offline.
echo.
powershell.exe -NoLogo -NoProfile -Command "$ErrorActionPreference='Stop'; try { if (-not [Environment]::Is64BitOperatingSystem) { throw 'This package needs 64-bit Windows.' }; $root=$env:RECEIPT_STUDIO_DIR.TrimEnd([char]92); $runtime=Join-Path $root '.runtime-44.9.1-win-x64'; $exe=Join-Path $runtime 'electron.exe'; if (-not (Test-Path -LiteralPath $exe)) { $zip=Join-Path $root '.electron-44.9.1-win-x64.zip'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Write-Host 'Downloading the app runtime. This can take a few minutes...'; Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/electron/electron/releases/download/v44.9.1/electron-v44.9.1-win32-x64.zip' -OutFile $zip; $hash=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash; if ($hash -ne '41bd7900bd42d0f49110a81617876137041fbbf473466920248ddb076349ef91') { Remove-Item -LiteralPath $zip; throw 'Runtime checksum mismatch. The app did not start.' }; Write-Host 'Checksum verified. Extracting...'; Expand-Archive -LiteralPath $zip -DestinationPath $runtime -Force; Remove-Item -LiteralPath $zip }; if (-not (Test-Path -LiteralPath $exe)) { throw 'The runtime did not extract correctly.' }; Start-Process -FilePath $exe -ArgumentList ([string][char]34+$root+[char]34) -WorkingDirectory $root; exit 0 } catch { Write-Host ('Could not start Receipt Studio: '+$_.Exception.Message) -ForegroundColor Red; exit 1 }"
if errorlevel 1 (
  echo.
  echo Keep this window open to read the error. No administrator access is required.
  pause
  exit /b 1
)
endlocal
