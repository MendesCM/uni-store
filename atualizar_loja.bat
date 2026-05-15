@echo off
echo.
echo ===========================================
echo   SUBINDO ATUALIZACOES PARA A VERCEL...
echo ===========================================
echo.

call npx vercel --prod

echo.
echo ===========================================
echo SUCESSO ABSOLUTO! 
echo A Uni Store e seus jogos estao atualizados no ar!
echo ===========================================
pause