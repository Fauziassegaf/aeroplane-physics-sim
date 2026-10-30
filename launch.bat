@echo off
echo ========================================================
echo  Fauzi AeroPhysics Lab - Aircraft Take-Off Simulation
echo ========================================================
echo.
echo  [1] Launch 3D Take-off Physics Simulation
echo  [2] Launch 3D Aircraft Model Viewer & Inspector
echo.
set /p choice="Select an option (1 or 2, default is 1): "
if "%choice%"=="2" (
    start "" "%~dp0aircraft_model_viewer.html"
) else (
    start "" "%~dp0index.html"
)
