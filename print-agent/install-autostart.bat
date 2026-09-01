@echo off
title Al-Latif QR Print Agent - One-Time Auto-Start Setup
echo ============================================================
echo   Al-Latif QR Print Agent - Automatic Windows Setup
echo ============================================================
echo.

set AGENT_DIR=%~dp0
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup

echo [1/3] Checking Node.js and Electron dependencies...
cd /d "%AGENT_DIR%"
if not exist "node_modules" (
    echo Installing required packages (one-time)...
    call npm install
)

echo.
echo [2/3] Creating background silent launcher...
(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.CurrentDirectory = "%AGENT_DIR:\=\\%"
echo WshShell.Run "npm start", 0, False
) > "%AGENT_DIR%start-silent.vbs"

echo.
echo [3/3] Adding Print Agent to Windows Startup folder...
(
echo Set oWS = WScript.CreateObject^("WScript.Shell"^)
echo sLinkFile = "%STARTUP_DIR%\Al-Latif-Print-Agent.lnk"
echo Set oLink = oWS.CreateShortcut^(sLinkFile^)
echo oLink.TargetPath = "wscript.exe"
echo oLink.Arguments = """%AGENT_DIR%start-silent.vbs"""
echo oLink.WorkingDirectory = "%AGENT_DIR%"
echo oLink.Description = "Al-Latif QR Print Agent"
echo oLink.Save
) > "%TEMP%\create_shortcut.vbs"

cscript //nologo "%TEMP%\create_shortcut.vbs"
del "%TEMP%\create_shortcut.vbs" >nul 2>&1

echo.
echo ============================================================
echo   [SUCCESS] Setup Completed!
echo ============================================================
echo.
echo  - The Print Agent will now run automatically on Windows startup.
echo  - It runs quietly in your System Tray with NO command prompt.
echo  - Starting the agent now in background...
echo.

start wscript "%AGENT_DIR%start-silent.vbs"
echo Agent launched in System Tray! You can close this window.
pause
