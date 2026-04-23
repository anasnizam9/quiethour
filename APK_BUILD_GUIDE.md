# APK Build Fix Guide

## Problem
The app works locally but fails in APK builds because it can't reach the backend URL configured in `app.json` (192.168.18.13:4000).

## Solution

### For Local Testing/Development APK:

1. **Ensure backend is running:**
   ```bash
   npm run start:backend
   ```
   Backend should be running on http://192.168.18.13:4000

2. **Build APK with local environment:**
   - On Windows (PowerShell):
   ```powershell
   $env:EXPO_PUBLIC_API_BASE_URL="http://192.168.18.13:4000"
   npm run apk:build
   ```
   
   - Or use the batch script:
   ```cmd
   build-apk.bat
   ```

3. **Install APK on device on same network:**
   - Ensure device is connected to same WiFi as your computer
   - The backend URL 192.168.18.13:4000 will be accessible

### For Production APK (to share with others):

1. **Deploy backend to public server** with HTTPS
   
2. **Update .env.production:**
   ```
   EXPO_PUBLIC_API_BASE_URL=https://your-public-backend-url.com
   ```

3. **Build production APK:**
   ```bash
   npm run apk:build:prod
   ```

## Environment Files

- **.env.local** - Local development (uses local network IP)
- **.env.production** - Production deployment (uses public URL)

## Troubleshooting

If building fails:
1. Verify backend is running: `npm run start:backend`
2. Check backend is accessible on your network
3. Clear EAS cache if needed: `eas build --platform android --clear-cache`
4. Make sure PORT in backend/.env is 4000

## Important Notes

- APKs built with local network IP will NOT work outside the local network
- For sharing with others, you must deploy backend to a public URL
- Backend must use HTTPS for production builds (not HTTP)
