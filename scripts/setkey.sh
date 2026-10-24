#!/bin/zsh
# Saves one key into .env.local without printing it.
# Run this first, then click Copy next to the value in the LiveKit dashboard within a minute.
# Usage: scripts/zoomkey.sh LIVEKIT_API_KEY
set -e
name="$1"
case "$name" in
  LIVEKIT_URL|LIVEKIT_API_KEY|LIVEKIT_API_SECRET) ;;
  *) echo "Use one of: LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET"; exit 1 ;;
esac
looks_like_key() { [[ -n "$1" && "$1" != *LIVEKIT_* && "$1" != *=* && "$1" != *" "* && "$1" != *zoomkey* && ${#1} -ge 10 && ${#1} -le 200 ]]; }

# IDs are not secret, so they may be typed after the name. Secrets must come from the Copy button.
if [ -n "$2" ]; then
  case "$name" in
    *SECRET) echo "Don't type secrets in the command. Run it without the value, then click Copy in LiveKit."; exit 1 ;;
  esac
  value="$2"
  env_file="$(cd "$(dirname "$0")/.." && pwd)/.env.local"
  tmp="$(mktemp)"
  awk -v n="$name" -v v="$value" 'BEGIN{done=0} $0 ~ "^"n"=" {print n"="v; done=1; next} {print} END{if(!done) print n"="v}' "$env_file" > "$tmp"
  mv "$tmp" "$env_file"
  echo "Saved $name (${#value} characters)."
  exit 0
fi

start="$(pbpaste)"
echo "Waiting: now click Copy next to the value for $name in LiveKit (up to 60 seconds)..."
value=""
for i in {1..120}; do
  now="$(pbpaste | tr -d '\r\n\t')"
  if [[ "$now" != "$start" ]] && looks_like_key "$now"; then value="$now"; break; fi
  sleep 0.5
done
if [ -z "$value" ]; then echo "Nothing new was copied. Run it again, then click Copy in LiveKit."; exit 1; fi

env_file="$(cd "$(dirname "$0")/.." && pwd)/.env.local"
tmp="$(mktemp)"
awk -v n="$name" -v v="$value" 'BEGIN{done=0} $0 ~ "^"n"=" {print n"="v; done=1; next} {print} END{if(!done) print n"="v}' "$env_file" > "$tmp"
mv "$tmp" "$env_file"
echo "Saved $name (${#value} characters)."
