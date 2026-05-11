#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: ./scripts/use-env.sh [local|aws]"
  exit 1
fi

case "$TARGET" in
  local)
    SOURCE_FILE="$ROOT_DIR/.env.local"
    ;;
  aws)
    SOURCE_FILE="$ROOT_DIR/.env.aws.local"
    ;;
  *)
    echo "Invalid target: $TARGET"
    echo "Usage: ./scripts/use-env.sh [local|aws]"
    exit 1
    ;;
esac

if [[ ! -f "$SOURCE_FILE" ]]; then
  echo "Source file not found: $SOURCE_FILE"
  exit 1
fi

cp "$SOURCE_FILE" "$ROOT_DIR/.env"
echo "Switched active env to: $TARGET"
echo "Active file: $ROOT_DIR/.env"