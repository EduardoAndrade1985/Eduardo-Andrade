@echo off
echo ============================================
echo  Deploy Local: Frontend ^> Backend/Static
echo ============================================

cd /d "%~dp0"

REM Garante que node_modules existe
if not exist "frontend\node_modules" (
    echo Instalando dependencias do frontend...
    cd frontend
    npm install
    cd ..
)

REM Build do frontend (output em frontend/dist)
echo Compilando frontend...
cd frontend
npm run build
if errorlevel 1 (
    echo ERRO no build! Abortando.
    pause
    exit /b 1
)
cd ..

REM Limpa assets antigos no backend
echo Limpando assets antigos...
del /Q "backend\static\assets\index-*.js"         >nul 2>&1
del /Q "backend\static\assets\index-*.css"        >nul 2>&1
del /Q "backend\static\assets\index.es-*.js"      >nul 2>&1
del /Q "backend\static\assets\purify.es-*.js"     >nul 2>&1
del /Q "backend\static\assets\html2canvas.esm-*.js" >nul 2>&1

REM Copia novos assets para backend/static
echo Copiando para backend/static...
xcopy /Y /Q "frontend\dist\assets\*" "backend\static\assets\" >nul
copy  /Y    "frontend\dist\index.html" "backend\static\index.html" >nul

echo.
echo ============================================
echo  Deploy local concluido!
echo  Reinicie o servidor Django se necessario.
echo ============================================
pause
