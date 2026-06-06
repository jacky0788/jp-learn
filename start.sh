#!/usr/bin/env bash
# 日文複習 啟動器（macOS / Linux）
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then
  python3 start.py "$@"
else
  python start.py "$@"
fi
