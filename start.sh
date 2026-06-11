#!/bin/bash
cd "$(dirname "$0")"

if ! command -v node &> /dev/null; then
    echo "Node.js not installed! https://nodejs.org"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

node src/index.js &
cd renderer && npm run dev &
echo "http://localhost:5173"
wait
