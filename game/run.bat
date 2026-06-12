:menu
@echo off
cls
echo.
echo Press 1 to play the original version of Ultima IV
echo Press 2 to play the updated version of Ultima IV
echo Press 3 to Quit
echo.
choice /C:123 /N Please Choose

If errorlevel 3 goto exit
If errorlevel 2 goto updated
If errorlevel 1 goto original

:updated
config -set "cpu cycles=5000"
cls
@cd upgrade
@ultima.com
goto exit

:original
config -set "cpu cycles=1000"
cls
@ultima.com
goto exit

:exit