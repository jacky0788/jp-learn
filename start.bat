@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在啟動 日文複習……
where py >nul 2>nul
if %errorlevel%==0 (
  py start.py %*
) else (
  python start.py %*
)
echo.
echo （視窗關閉前可按任意鍵）
pause >nul
