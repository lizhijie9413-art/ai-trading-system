@echo off
cd /d %~dp0
npm install
node server.js
pause