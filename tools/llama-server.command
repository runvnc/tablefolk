#!/usr/bin/env bash
# macOS: double-click to start llama-server with LFM3 for Tablefolk (see llama-server.sh).
cd "$(dirname "$0")" && exec ./llama-server.sh "$@"
