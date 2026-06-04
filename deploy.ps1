Write-Host "==> Buildando frontend..." -ForegroundColor Cyan
Set-Location frontend
npm run build
if (-not $?) { Write-Host "Build do frontend falhou." -ForegroundColor Red; exit 1 }
Set-Location ..

Write-Host "==> Commitando build + codigo..." -ForegroundColor Cyan
git add backend/static/ frontend/vite.config.js
git add -A
git status --short

$msg = Read-Host "Mensagem do commit (Enter para usar 'deploy: build frontend')"
if (-not $msg) { $msg = "deploy: build frontend" }

git commit -m $msg
if (-not $?) { Write-Host "Nada para commitar ou erro." -ForegroundColor Yellow; exit 0 }

Write-Host "==> Enviando para GitHub (Render faz deploy automatico)..." -ForegroundColor Cyan
git push origin main

Write-Host "==> Deploy enviado! Acompanhe em: https://dashboard.render.com" -ForegroundColor Green
