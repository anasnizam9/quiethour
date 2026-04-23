#!/bin/bash
# Load environment from .env.local and build APK

set -a
source .env.local
set +a

echo "Using API URL: $EXPO_PUBLIC_API_BASE_URL"
npx eas-cli build -p android --profile preview --local
