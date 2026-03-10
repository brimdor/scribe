#!/usr/bin/env bash

# Scribe - Local Development Server

cd "$(dirname "$0")" || exit

echo "Starting Scribe local development server..."
echo "Press Ctrl+C to stop."
echo ""

# Run the Vite dev server with network exposure to easily test on other devices if needed
npm run dev -- --host
