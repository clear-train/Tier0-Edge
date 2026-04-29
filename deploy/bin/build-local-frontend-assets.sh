#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/../../frontend"

cd "$FRONTEND_DIR"

npx pnpm@10.13.1 build:web
npx pnpm@10.13.1 build:servicesExpress
