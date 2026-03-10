#!/usr/bin/env bash

# Scribe - Local Development Server

cd "$(dirname "$0")" || exit

echo "Starting Scribe local development server..."
echo "Press Ctrl+C to stop."
echo ""

# Run API + Vite dev servers together
npm run dev
