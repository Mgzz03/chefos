@echo off
REM Opens the ChefOS license admin page reliably via a local server.
cd /d "%~dp0"
start "" "http://localhost:8123/admin.html"
py -m http.server 8123
