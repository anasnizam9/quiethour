@echo off
REM Load environment from .env.local and build APK

for /f "tokens=*" %%i in ('type .env.local') do set %%i
echo Using API URL: %EXPO_PUBLIC_API_BASE_URL%
npx eas-cli build -p android --profile preview
pause
