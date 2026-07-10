#!/usr/bin/env bash
set -euo pipefail

OPTIONS_FILE="/data/options.json"
GENERATED_CONFIG="/tmp/repos.yml"
REPO_CACHE_DIR="/data/repos"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

read_option() {
  local key="$1"
  local fallback="$2"

  jq -r --arg key "$key" --arg fallback "$fallback" '.[$key] // $fallback' "$OPTIONS_FILE"
}

if [[ ! -f "$OPTIONS_FILE" ]]; then
  log "ERROR: Missing Home Assistant add-on options file: $OPTIONS_FILE"
  exit 1
fi

mkdir -p "$REPO_CACHE_DIR"

jq '{ repos: (.repos // []) }' "$OPTIONS_FILE" > "$GENERATED_CONFIG"

export CONFIG_FILE="$GENERATED_CONFIG"
export DATA_DIR="$REPO_CACHE_DIR"

export SYNC_INTERVAL
SYNC_INTERVAL="$(read_option sync_interval 3600)"

export RUN_ON_START
RUN_ON_START="$(read_option run_on_start true)"

export MIRROR_MODE
MIRROR_MODE="$(read_option mirror_mode heads-tags)"

export SOURCE_PROVIDER
SOURCE_PROVIDER="$(read_option source_provider github)"

export SOURCE_USERNAME
SOURCE_USERNAME="$(read_option source_username '')"

export SOURCE_TOKEN
SOURCE_TOKEN="$(read_option source_token '')"

export TARGET_PROVIDER
TARGET_PROVIDER="$(read_option target_provider gitlab)"

export TARGET_USERNAME
TARGET_USERNAME="$(read_option target_username '')"

export TARGET_TOKEN
TARGET_TOKEN="$(read_option target_token '')"

export GITHUB_USERNAME
GITHUB_USERNAME="$(read_option github_username '')"

export GITHUB_TOKEN
GITHUB_TOKEN="$(read_option github_token '')"

export GITLAB_USERNAME
GITLAB_USERNAME="$(read_option gitlab_username oauth2)"

export GITLAB_TOKEN
GITLAB_TOKEN="$(read_option gitlab_token '')"

export GITEA_USERNAME
GITEA_USERNAME="$(read_option gitea_username '')"

export GITEA_TOKEN
GITEA_TOKEN="$(read_option gitea_token '')"

export FORGEJO_USERNAME
FORGEJO_USERNAME="$(read_option forgejo_username '')"

export FORGEJO_TOKEN
FORGEJO_TOKEN="$(read_option forgejo_token '')"

export NOTIFY_ON_SUCCESS
NOTIFY_ON_SUCCESS="$(read_option notify_on_success false)"

export NOTIFY_ON_FAILURE
NOTIFY_ON_FAILURE="$(read_option notify_on_failure true)"

export HA_NOTIFICATIONS
HA_NOTIFICATIONS="$(read_option ha_notifications true)"

export NTFY_ENABLED
NTFY_ENABLED="$(read_option ntfy_enabled false)"

export NTFY_URL
NTFY_URL="$(read_option ntfy_url 'https://ntfy.sh')"

export NTFY_TOPIC
NTFY_TOPIC="$(read_option ntfy_topic '')"

export NTFY_TOKEN
NTFY_TOKEN="$(read_option ntfy_token '')"

export GOTIFY_ENABLED
GOTIFY_ENABLED="$(read_option gotify_enabled false)"

export GOTIFY_URL
GOTIFY_URL="$(read_option gotify_url '')"

export GOTIFY_TOKEN
GOTIFY_TOKEN="$(read_option gotify_token '')"

export DISCORD_ENABLED
DISCORD_ENABLED="$(read_option discord_enabled false)"

export DISCORD_WEBHOOK_URL
DISCORD_WEBHOOK_URL="$(read_option discord_webhook_url '')"

log "Starting Git Repository Mirror add-on"
log "Mirror mode: $MIRROR_MODE"
log "Default source provider: $SOURCE_PROVIDER"
log "Default target provider: $TARGET_PROVIDER"
log "Sync interval: ${SYNC_INTERVAL}s"
log "Repo cache: $REPO_CACHE_DIR"

exec /app/mirror.sh
