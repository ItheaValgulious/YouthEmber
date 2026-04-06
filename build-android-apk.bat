@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "BUILD_TASK=assembleDebug"
set "APK_DIR=app\build\outputs\apk\debug"

if /I "%~1"=="release" (
  set "BUILD_TASK=assembleRelease"
  set "APK_DIR=app\build\outputs\apk\release"
)

echo Building APK (%BUILD_TASK%)...
pushd android

if not exist "gradlew.bat" (
  echo gradlew.bat not found under android\.
  popd
  exit /b 1
)

call gradlew.bat %BUILD_TASK%
if errorlevel 1 (
  popd
  goto :error
)

set "APK_FULL_PATH="
for /r "%APK_DIR%" %%F in (*.apk) do set "APK_FULL_PATH=%%~fF"

if defined APK_FULL_PATH (
  echo.
  echo APK generated at:
  echo !APK_FULL_PATH!
) else (
  echo.
  echo Build completed, but no APK was found under:
  echo %CD%\%APK_DIR%
)

popd
exit /b 0

:error
echo.
echo Build failed with exit code %errorlevel%.
exit /b %errorlevel%
