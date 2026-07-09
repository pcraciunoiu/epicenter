#!/usr/bin/env bash
# Start Whispering with optional Linux global shortcut listeners.
#
# Defaults (override with env):
#   WHISPERING_PTT_KEY=F14       hold-to-talk via evdev listener
#   WHISPERING_TOGGLE_KEY=F15    tap-to-toggle via evdev listener
#   WHISPERING_BIN=/usr/bin/whispering
#   WHISPERING_LISTENER=~/.local/bin/whispering-ptt-listener.py
#   WHISPERING_START_LISTENER=1  set to 0 to skip the listener
#
# Example:
#   WHISPERING_PTT_KEY=F14 WHISPERING_TOGGLE_KEY=F15 ./whispering-start.sh

set -euo pipefail

export WHISPERING_PTT_KEY="${WHISPERING_PTT_KEY:-F14}"
export WHISPERING_TOGGLE_KEY="${WHISPERING_TOGGLE_KEY:-F15}"
WHISPERING_BIN="${WHISPERING_BIN:-/usr/bin/whispering}"
WHISPERING_LISTENER="${WHISPERING_LISTENER:-$HOME/.local/bin/whispering-ptt-listener.py}"
WHISPERING_START_LISTENER="${WHISPERING_START_LISTENER:-1}"

if [[ ! -x "$WHISPERING_BIN" ]]; then
	echo "Whispering binary not found or not executable: $WHISPERING_BIN" >&2
	exit 1
fi

# Export so the desktop app picks up the same shortcut defaults on launch.
export WHISPERING_PTT_KEY WHISPERING_TOGGLE_KEY

"$WHISPERING_BIN" "$@" &
app_pid=$!

if [[ "$WHISPERING_START_LISTENER" == "1" && -x "$WHISPERING_LISTENER" ]]; then
	"$WHISPERING_LISTENER" \
		--whispering "$WHISPERING_BIN" \
		--key "$WHISPERING_PTT_KEY" \
		--toggle-key "$WHISPERING_TOGGLE_KEY" &
	listener_pid=$!
	trap 'kill "$listener_pid" 2>/dev/null || true' EXIT
fi

wait "$app_pid"
