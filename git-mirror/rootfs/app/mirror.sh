#!/usr/bin/env bash
set -uo pipefail

CONFIG_FILE="${CONFIG_FILE:-/tmp/repos.yml}"
DATA_DIR="${DATA_DIR:-/data/repos}"

SYNC_INTERVAL="${SYNC_INTERVAL:-3600}"
RUN_ON_START="${RUN_ON_START:-true}"
MIRROR_MODE="${MIRROR_MODE:-heads-tags}"

GITHUB_USERNAME="${GITHUB_USERNAME:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
GITLAB_USERNAME="${GITLAB_USERNAME:-oauth2}"
GITLAB_TOKEN="${GITLAB_TOKEN:-}"

NOTIFY_ON_SUCCESS="${NOTIFY_ON_SUCCESS:-false}"
NOTIFY_ON_FAILURE="${NOTIFY_ON_FAILURE:-true}"
HA_NOTIFICATIONS="${HA_NOTIFICATIONS:-true}"
NTFY_ENABLED="${NTFY_ENABLED:-false}"
NTFY_URL="${NTFY_URL:-https://ntfy.sh}"
NTFY_TOPIC="${NTFY_TOPIC:-}"
NTFY_TOKEN="${NTFY_TOKEN:-}"
GOTIFY_ENABLED="${GOTIFY_ENABLED:-false}"
GOTIFY_URL="${GOTIFY_URL:-}"
GOTIFY_TOKEN="${GOTIFY_TOKEN:-}"
DISCORD_ENABLED="${DISCORD_ENABLED:-false}"
DISCORD_WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

bool_true() {
  [[ "${1,,}" == "true" || "$1" == "1" || "${1,,}" == "yes" ]]
}

url_encode() {
  local raw="${1}"
  local length="${#raw}"
  local encoded=""
  local pos c o

  for ((pos = 0; pos < length; pos++)); do
    c="${raw:$pos:1}"
    case "$c" in
      [a-zA-Z0-9.~_-])
        encoded+="$c"
        ;;
      *)
        printf -v o '%%%02X' "'$c"
        encoded+="$o"
        ;;
    esac
  done

  echo "$encoded"
}

inject_github_auth() {
  local url="$1"

  if [[ -z "$GITHUB_TOKEN" ]]; then
    echo "$url"
    return
  fi

  if [[ "$url" != https://github.com/* ]]; then
    echo "$url"
    return
  fi

  local username="${GITHUB_USERNAME:-x-access-token}"
  local enc_user enc_token

  enc_user="$(url_encode "$username")"
  enc_token="$(url_encode "$GITHUB_TOKEN")"

  echo "${url/https:\/\//https://${enc_user}:${enc_token}@}"
}

inject_gitlab_auth() {
  local url="$1"

  if [[ -z "$GITLAB_TOKEN" ]]; then
    echo "$url"
    return
  fi

  if [[ "$url" != https://* && "$url" != http://* ]]; then
    echo "$url"
    return
  fi

  local enc_user enc_token

  enc_user="$(url_encode "$GITLAB_USERNAME")"
  enc_token="$(url_encode "$GITLAB_TOKEN")"

  if [[ "$url" == https://* ]]; then
    echo "${url/https:\/\//https://${enc_user}:${enc_token}@}"
  else
    echo "${url/http:\/\//http://${enc_user}:${enc_token}@}"
  fi
}

sanitize_name() {
  echo "$1" | tr -c 'a-zA-Z0-9._-' '_'
}

notify_home_assistant() {
  local title="$1"
  local message="$2"
  local notification_id="$3"

  if ! bool_true "$HA_NOTIFICATIONS"; then
    return 0
  fi

  if [[ -z "${SUPERVISOR_TOKEN:-}" ]]; then
    log "Skipping HA notification: SUPERVISOR_TOKEN is unavailable"
    return 0
  fi

  curl -fsS \
    -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg title "$title" --arg message "$message" --arg notification_id "$notification_id" '{title:$title,message:$message,notification_id:$notification_id}')" \
    http://supervisor/core/api/services/persistent_notification/create >/dev/null 2>&1 || \
    log "WARNING: Failed to send Home Assistant persistent notification"
}

notify_ntfy() {
  local title="$1"
  local message="$2"

  if ! bool_true "$NTFY_ENABLED"; then
    return 0
  fi

  if [[ -z "$NTFY_URL" || -z "$NTFY_TOPIC" ]]; then
    log "Skipping ntfy notification: ntfy_url or ntfy_topic is empty"
    return 0
  fi

  local auth_args=()
  if [[ -n "$NTFY_TOKEN" ]]; then
    auth_args=(-H "Authorization: Bearer ${NTFY_TOKEN}")
  fi

  curl -fsS \
    -H "Title: ${title}" \
    "${auth_args[@]}" \
    -d "$message" \
    "${NTFY_URL%/}/${NTFY_TOPIC}" >/dev/null 2>&1 || \
    log "WARNING: Failed to send ntfy notification"
}

notify_gotify() {
  local title="$1"
  local message="$2"
  local priority="$3"

  if ! bool_true "$GOTIFY_ENABLED"; then
    return 0
  fi

  if [[ -z "$GOTIFY_URL" || -z "$GOTIFY_TOKEN" ]]; then
    log "Skipping Gotify notification: gotify_url or gotify_token is empty"
    return 0
  fi

  curl -fsS \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg title "$title" --arg message "$message" --argjson priority "$priority" '{title:$title,message:$message,priority:$priority}')" \
    "${GOTIFY_URL%/}/message?token=${GOTIFY_TOKEN}" >/dev/null 2>&1 || \
    log "WARNING: Failed to send Gotify notification"
}

notify_discord() {
  local title="$1"
  local message="$2"

  if ! bool_true "$DISCORD_ENABLED"; then
    return 0
  fi

  if [[ -z "$DISCORD_WEBHOOK_URL" ]]; then
    log "Skipping Discord notification: discord_webhook_url is empty"
    return 0
  fi

  curl -fsS \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg content "**${title}**\n${message}" '{content:$content}')" \
    "$DISCORD_WEBHOOK_URL" >/dev/null 2>&1 || \
    log "WARNING: Failed to send Discord notification"
}

notify_all() {
  local level="$1"
  local title="$2"
  local message="$3"
  local notification_id="$4"

  local priority=3
  if [[ "$level" == "error" ]]; then
    priority=8
  fi

  notify_home_assistant "$title" "$message" "$notification_id"
  notify_ntfy "$title" "$message"
  notify_gotify "$title" "$message" "$priority"
  notify_discord "$title" "$message"
}

disable_mirror_config() {
  # Repos originally created with `git clone --mirror` contain remote.origin.mirror=true.
  # That setting breaks refspec pushes with: fatal: --mirror can't be combined with refspecs
  git config --unset-all remote.origin.mirror 2>/dev/null || true
}

ensure_repo_exists() {
  local name="$1"
  local source_auth="$2"
  local repo_dir="$3"

  if [[ ! -d "$repo_dir" ]]; then
    log "Cloning bare repo for $name"
    git clone --bare "$source_auth" "$repo_dir" || return 1
    return 0
  fi

  if [[ ! -d "$repo_dir/objects" ]]; then
    log "ERROR: Existing path is not a valid bare Git repo: $repo_dir"
    return 1
  fi

  return 0
}

push_heads_tags() {
  local name="$1"

  log "Pushing branches for $name"
  git push origin "refs/heads/*:refs/heads/*" || return 1

  log "Pushing tags for $name"
  git push origin "refs/tags/*:refs/tags/*" || return 1
}

push_heads_tags_prune() {
  local name="$1"

  log "Pushing branches with prune for $name"
  git push origin "refs/heads/*:refs/heads/*" --prune || return 1

  log "Pushing tags with prune for $name"
  git push origin "refs/tags/*:refs/tags/*" --prune || return 1
}

push_full_mirror() {
  local name="$1"

  log "Pushing full mirror for $name"
  git push --mirror || return 1
}

sync_repo() {
  local index="$1"
  local name source target enabled repo_dir source_auth target_auth

  name="$(yq -r ".repos[$index].name" "$CONFIG_FILE")"
  source="$(yq -r ".repos[$index].source" "$CONFIG_FILE")"
  target="$(yq -r ".repos[$index].target" "$CONFIG_FILE")"
  enabled="$(yq -r ".repos[$index].enabled // true" "$CONFIG_FILE")"

  if [[ "$enabled" != "true" ]]; then
    log "Skipping disabled repo: $name"
    return 0
  fi

  if [[ -z "$name" || "$name" == "null" ]]; then
    log "Skipping repo at index $index: missing name"
    return 0
  fi

  if [[ -z "$source" || "$source" == "null" ]]; then
    log "Skipping $name: missing source"
    return 1
  fi

  if [[ -z "$target" || "$target" == "null" ]]; then
    log "Skipping $name: missing target"
    return 1
  fi

  repo_dir="$DATA_DIR/$(sanitize_name "$name").git"
  source_auth="$(inject_github_auth "$source")"
  target_auth="$(inject_gitlab_auth "$target")"

  log "Syncing: $name"

  ensure_repo_exists "$name" "$source_auth" "$repo_dir" || return 1

  cd "$repo_dir" || return 1

  git remote set-url origin "$source_auth" || return 1
  git remote set-url --push origin "$target_auth" || return 1
  disable_mirror_config

  log "Fetching updates for $name"
  git remote update --prune || return 1

  case "$MIRROR_MODE" in
    heads-tags)
      push_heads_tags "$name" || return 1
      ;;
    heads-tags-prune)
      push_heads_tags_prune "$name" || return 1
      ;;
    mirror)
      push_full_mirror "$name" || return 1
      ;;
    *)
      log "ERROR: Invalid MIRROR_MODE: $MIRROR_MODE"
      log "Valid values: heads-tags, heads-tags-prune, mirror"
      return 1
      ;;
  esac

  log "Finished: $name"
  return 0
}

run_once() {
  if [[ ! -f "$CONFIG_FILE" ]]; then
    log "ERROR: Missing config file: $CONFIG_FILE"
    return 1
  fi

  mkdir -p "$DATA_DIR"

  local count
  count="$(yq -r '.repos | length' "$CONFIG_FILE")"

  if [[ "$count" == "0" || "$count" == "null" ]]; then
    log "No repos configured. Add repositories in the add-on configuration."
    return 0
  fi

  local failures=0
  local successes=0
  local failed_names=()

  for ((i = 0; i < count; i++)); do
    local repo_name
    repo_name="$(yq -r ".repos[$i].name // \"repo-$i\"" "$CONFIG_FILE")"

    if sync_repo "$i"; then
      successes=$((successes + 1))
    else
      failures=$((failures + 1))
      failed_names+=("$repo_name")
      log "ERROR: Failed syncing: $repo_name"
    fi
  done

  if (( failures > 0 )); then
    local message
    message="${failures} repo(s) failed, ${successes} repo(s) succeeded. Failed: ${failed_names[*]}"
    log "$message"

    if bool_true "$NOTIFY_ON_FAILURE"; then
      notify_all "error" "Git Mirror failed" "$message" "git_mirror_failure"
    fi

    return 1
  fi

  local message
  message="All configured repositories synced successfully. Synced: ${successes}"
  log "$message"

  if bool_true "$NOTIFY_ON_SUCCESS"; then
    notify_all "info" "Git Mirror successful" "$message" "git_mirror_success"
  fi

  return 0
}

log "Git mirror service started"
log "Sync interval: ${SYNC_INTERVAL}s"
log "Mirror mode: ${MIRROR_MODE}"

if bool_true "$RUN_ON_START"; then
  run_once || true
else
  log "run_on_start is false; waiting until the first scheduled interval"
fi

while true; do
  sleep "$SYNC_INTERVAL"
  run_once || true
done
