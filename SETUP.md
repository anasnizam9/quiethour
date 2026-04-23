# Quiet Hour - Setup & Run Guide

## Quick Start

### Step 1: Start Backend Server
```bash
cd c:\Users\HP\Documents\quiethour
npm run start:backend
```

Backend will run on `http://localhost:4000`

Output should show:
```
Quiet Hour backend running on port 4000
```

### Firebase Database Setup
The app now persists users, reviews, and spot suggestions in Firebase Firestore when the backend is configured.

1. Create a Firebase project in the Firebase console.
2. Enable Firestore Database in the project.
3. Generate a service account key from Project Settings > Service Accounts.
4. Copy these values into `backend/.env`:
	- `FIREBASE_PROJECT_ID`
	- `FIREBASE_CLIENT_EMAIL`
	- `FIREBASE_PRIVATE_KEY`
5. Paste the private key with escaped new lines, like `\n`.
6. Restart the backend after saving the file.

The backend now requires Firebase to be configured. It will not start without these values.

### Android APK Build (Installable App)
Use this when you want a real APK file for Android install.

1. Set a public backend URL in root `.env`:
	- `EXPO_PUBLIC_API_BASE_URL=https://your-backend-domain.com`
2. Build APK using EAS:
	- `npm run apk:build`
3. If asked, login to Expo account in terminal.
4. After build finishes, open the download URL from terminal and install APK.

Notes:
- `localhost` backend will not work inside installed APK.
- You must deploy backend on a public URL (Render/Railway/VM/etc) before APK testing.

### Step 2: Start Frontend (New Terminal)
```bash
cd c:\Users\HP\Documents\quiethour
npm start
```

If Expo Go scanner shows `exp://127.0.0.1:8081` and cannot connect:
1. Stop the frontend terminal
2. Run `npm run start:tunnel` (or keep `npm start` in LAN mode)
3. Make sure phone and laptop are on the same Wi-Fi for LAN mode

Press `i` for iOS simulator or `a` for Android, or use Expo Go app.

### Step 3: Login
- Email: `student@quiethour.app`
- Password: `quiet123`

## Troubleshooting

### "Network requested timed out" Error
This means the backend server isn't running or isn't accessible.

**Solution:**
1. Make sure you ran `npm run start:backend` in a separate terminal
2. Check that terminal shows "Quiet Hour backend running on port 4000"
3. Verify no other process is using port 4000
4. If using Expo Go on device, ensure device and computer are on same network

### "Request timeout: backend server not responding"
Backend is not accessible from your Expo app. Try:
1. Check if backend terminal is showing any errors
2. Run backend with more verbose logging: `npm --prefix backend run dev`
3. Check firewall settings

### Network/Connection Issues
- Ensure both frontend and backend terminals are active
- Backend MUST be running before you try to login
- If using Expo Go, your phone/emulator needs same network access as computer
- If scanner URL starts with `exp://127.0.0.1:8081`, restart frontend with `npm run start:tunnel`

## Development

### Run with Live Reload
```bash
# Terminal 1 - Backend with file watching
npm run dev:backend

# Terminal 2 - Frontend
npm start
```

### Project Structure
```
quiethour/
├── src/
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   └── HomeScreen.tsx
│   ├── services/
│   │   └── api.ts
│   ├── theme.ts
│   └── types.ts
├── backend/
│   └── server.js
├── App.tsx
└── package.json
```

## API Endpoints

### Health Check
```
GET http://localhost:4000/api/health
```

### Login
```
POST http://localhost:4000/api/auth/login
Body: { "email": "student@quiethour.app", "password": "quiet123" }
Response: { "token": "...", "user": { "name": "...", "email": "..." } }
```

### Firebase Collections
When Firebase is enabled, the backend uses these Firestore paths:
- `users/{email}`
- `places/{placeId}/reviews/{reviewId}`
- `spotSuggestions/{suggestionId}`

### Get Nearby Quiet Places
```
GET http://localhost:4000/api/places/quiet-nearby?lat=33.6844&lng=73.0479
Response: { "places": [...] }
```
