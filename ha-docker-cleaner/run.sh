#!/usr/bin/env bash
set -euo pipefail

CONFIG_PATH="/data/options.json"
LOG_FILE="/share/ha-docker-cleaner.log"

# -----------------------------
# Config helpers
# -----------------------------

get_config() {
  local key="$1"
  local default="$2"
  jq -r --arg key "$key" --arg default "$default" '.[$key] // $default' "$CONFIG_PATH"
}

get_bool() {
  local key="$1"
  local default="$2"
  jq -r --arg key "$key" --argjson default "$default" '.[$key] // $default' "$CONFIG_PATH"
}

# -----------------------------
# Load options
# -----------------------------

RUN_DAY="$(get_config "run_day" "sun")"
RUN_HOUR="$(get_config "run_hour" "4")"
RUN_ON_START="$(get_bool "run_on_start" false)"
RUN_ON_START_DELAY="$(get_config "run_on_start_delay" "900")"
DRY_RUN="$(get_bool "dry_run" false)"
PRUNE_UNTIL="$(get_config "prune_until" "")"

PRUNE_IMAGES="$(get_bool "prune_images" true)"
PRUNE_CONTAINERS="$(get_bool "prune_containers" true)"
PRUNE_BUILDER="$(get_bool "prune_builder" false)"
PRUNE_VOLUMES="$(get_bool "prune_volumes" false)"
PRUNE_NETWORKS="$(get_bool "prune_networks" false)"
LOG_MAX_LINES="$(get_config "log_max_lines" "500")"

if ! [[ "$LOG_MAX_LINES" =~ ^[0-9]+$ ]] || [ "$LOG_MAX_LINES" -lt 100 ]; then
  LOG_MAX_LINES="500"
fi

NOTIFY_ENABLED="$(get_bool "notify_enabled" true)"
NOTIFY_ON_SUCCESS="$(get_bool "notify_on_success" true)"
NOTIFY_ON_FAILURE="$(get_bool "notify_on_failure" true)"
NOTIFY_MODE="$(get_config "notify_mode" "persistent_notification")"

HA_NOTIFY_SERVICE="$(get_config "ha_notify_service" "notify.notify")"

NTFY_ENABLED="$(get_bool "ntfy_enabled" false)"
NTFY_URL="$(get_config "ntfy_url" "https://ntfy.sh")"
NTFY_TOPIC="$(get_config "ntfy_topic" "")"
NTFY_TOKEN="$(get_config "ntfy_token" "")"

GOTIFY_ENABLED="$(get_bool "gotify_enabled" false)"
GOTIFY_URL="$(get_config "gotify_url" "")"
GOTIFY_TOKEN="$(get_config "gotify_token" "")"
GOTIFY_PRIORITY="$(get_config "gotify_priority" "5")"

# -----------------------------
# Logging
# -----------------------------

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

trim_log() {
  if [ -f "$LOG_FILE" ]; then
    tail -"${LOG_MAX_LINES}" "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
  fi
}

format_command() {
  printf '%q ' "$@"
  echo
}

# -----------------------------
# Schedule helpers
# -----------------------------

day_number() {
  case "$1" in
    mon) echo 1 ;;
    tue) echo 2 ;;
    wed) echo 3 ;;
    thu) echo 4 ;;
    fri) echo 5 ;;
    sat) echo 6 ;;
    sun) echo 7 ;;
    *) echo 7 ;;
  esac
}

TARGET_DAY="$(day_number "$RUN_DAY")"

# -----------------------------
# Notification helpers
# -----------------------------

ha_service_call() {
  local domain="$1"
  local service="$2"
  local data="$3"

  if [ -z "${SUPERVISOR_TOKEN:-}" ]; then
    log "Home Assistant API skipped: SUPERVISOR_TOKEN missing"
    return 0
  fi

  if ! curl -sS \
    -X POST \
    -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$data" \
    "http://supervisor/core/api/services/${domain}/${service}" \
    >/dev/null 2>&1; then
    log "Home Assistant API notification failed: ${domain}.${service}"
  fi
}

send_persistent_notification() {
  local title="$1"
  local message="$2"

  local data
  data="$(jq -n \
    --arg title "$title" \
    --arg message "$message" \
    --arg notification_id "ha_docker_cleaner" \
    '{
      title: $title,
      message: $message,
      notification_id: $notification_id
    }')"

  ha_service_call "persistent_notification" "create" "$data"
}

send_ha_notify() {
  local title="$1"
  local message="$2"

  local service_domain
  local service_name

  service_domain="$(echo "$HA_NOTIFY_SERVICE" | cut -d. -f1)"
  service_name="$(echo "$HA_NOTIFY_SERVICE" | cut -d. -f2-)"

  if [ -z "$service_domain" ] || [ -z "$service_name" ] || [ "$service_domain" = "$service_name" ]; then
    log "Invalid ha_notify_service: ${HA_NOTIFY_SERVICE}"
    return 0
  fi

  local data
  data="$(jq -n \
    --arg title "$title" \
    --arg message "$message" \
    '{
      title: $title,
      message: $message
    }')"

  ha_service_call "$service_domain" "$service_name" "$data"
}

send_ntfy() {
  local title="$1"
  local message="$2"
  local priority="$3"

  [ "$NTFY_ENABLED" = "true" ] || return 0

  if [ -z "$NTFY_TOPIC" ]; then
    log "ntfy skipped: ntfy_topic is empty"
    return 0
  fi

  local url="${NTFY_URL%/}/${NTFY_TOPIC}"

  if [ -n "$NTFY_TOKEN" ]; then
    if ! curl -sS \
      -H "Authorization: Bearer ${NTFY_TOKEN}" \
      -H "Title: ${title}" \
      -H "Priority: ${priority}" \
      -d "$message" \
      "$url" \
      >/dev/null 2>&1; then
      log "ntfy notification failed"
    fi
  else
    if ! curl -sS \
      -H "Title: ${title}" \
      -H "Priority: ${priority}" \
      -d "$message" \
      "$url" \
      >/dev/null 2>&1; then
      log "ntfy notification failed"
    fi
  fi
}

send_gotify() {
  local title="$1"
  local message="$2"
  local priority="$3"

  [ "$GOTIFY_ENABLED" = "true" ] || return 0

  if [ -z "$GOTIFY_URL" ]; then
    log "Gotify skipped: gotify_url is empty"
    return 0
  fi

  if [ -z "$GOTIFY_TOKEN" ]; then
    log "Gotify skipped: gotify_token is empty"
    return 0
  fi

  local url="${GOTIFY_URL%/}/message?token=${GOTIFY_TOKEN}"

  if ! curl -sS \
    -X POST \
    -F "title=${title}" \
    -F "message=${message}" \
    -F "priority=${priority}" \
    "$url" \
    >/dev/null 2>&1; then
    log "Gotify notification failed"
  fi
}

notify() {
  local status="$1"
  local title="$2"
  local message="$3"

  [ "$NOTIFY_ENABLED" = "true" ] || return 0

  if [ "$status" = "success" ] && [ "$NOTIFY_ON_SUCCESS" != "true" ]; then
    return 0
  fi

  if [ "$status" = "failure" ] && [ "$NOTIFY_ON_FAILURE" != "true" ]; then
    return 0
  fi

  case "$NOTIFY_MODE" in
    persistent_notification)
      send_persistent_notification "$title" "$message"
      ;;
    ha_notify)
      send_ha_notify "$title" "$message"
      ;;
    external)
      send_ntfy "$title" "$message" "default"
      send_gotify "$title" "$message" "$GOTIFY_PRIORITY"
      ;;
    all)
      send_persistent_notification "$title" "$message"
      send_ha_notify "$title" "$message"
      send_ntfy "$title" "$message" "default"
      send_gotify "$title" "$message" "$GOTIFY_PRIORITY"
      ;;
    *)
      log "Unknown notify_mode: ${NOTIFY_MODE}"
      ;;
  esac
}

# -----------------------------
# Docker helpers
# -----------------------------

docker_available() {
  if ! command -v docker >/dev/null 2>&1; then
    log "ERROR: docker command not found"
    return 1
  fi

  if ! docker version >/dev/null 2>&1; then
    log "ERROR: Docker API is not reachable"
    return 1
  fi

  return 0
}

run_docker_command() {
  local label="$1"
  shift

  log "$label"
  log "Command: $(format_command "$@")"

  if [ "$DRY_RUN" = "true" ]; then
    log "Dry run enabled; command not executed"
    return 0
  fi

  if ! "$@" 2>&1 | tee -a "$LOG_FILE"; then
    log "ERROR: Command failed: $*"
    return 1
  fi

  return 0
}

# -----------------------------
# Cleanup
# -----------------------------

run_cleanup() {
  trim_log

  local errors=0

  log "=============================="
  log "HA Docker Cleaner started"
  log "Schedule: ${RUN_DAY} at ${RUN_HOUR}:00"
  log "Options:"
  log "  prune_images=${PRUNE_IMAGES}"
  log "  prune_containers=${PRUNE_CONTAINERS}"
  log "  prune_builder=${PRUNE_BUILDER}"
  log "  prune_volumes=${PRUNE_VOLUMES}"
  log "  prune_networks=${PRUNE_NETWORKS}"
  log "  prune_until=${PRUNE_UNTIL:-disabled}"
  log "  dry_run=${DRY_RUN}"
  log "  log_max_lines=${LOG_MAX_LINES}"
  log "  notify_enabled=${NOTIFY_ENABLED}"
  log "  notify_mode=${NOTIFY_MODE}"

  log "Before disk usage:"
  df -h 2>&1 | tee -a "$LOG_FILE" || true

  if ! docker_available; then
    errors=$((errors + 1))

    notify "failure" \
      "HA Docker Cleaner failed" \
      "Docker cleanup could not run because Docker is unavailable.

Check the add-on log and make sure docker_api is enabled."

    log "HA Docker Cleaner finished with errors"
    return 0
  fi

  log "Before Docker usage:"
  docker system df 2>&1 | tee -a "$LOG_FILE" || true

  local filter_args=()
  if [ -n "$PRUNE_UNTIL" ]; then
    filter_args=(--filter "until=${PRUNE_UNTIL}")
  fi

  if [ "$PRUNE_BUILDER" = "true" ]; then
    run_docker_command "Pruning Docker builder cache" docker builder prune -af "${filter_args[@]}" || errors=$((errors + 1))
  else
    log "Skipping Docker builder cache prune"
  fi

  if [ "$PRUNE_IMAGES" = "true" ]; then
    run_docker_command "Pruning unused Docker images" docker image prune -af "${filter_args[@]}" || errors=$((errors + 1))
  else
    log "Skipping Docker image prune"
  fi

  if [ "$PRUNE_CONTAINERS" = "true" ]; then
    run_docker_command "Pruning stopped containers" docker container prune -f "${filter_args[@]}" || errors=$((errors + 1))
  else
    log "Skipping Docker container prune"
  fi

  if [ "$PRUNE_NETWORKS" = "true" ]; then
    run_docker_command "Pruning unused Docker networks" docker network prune -f "${filter_args[@]}" || errors=$((errors + 1))
  else
    log "Skipping Docker network prune"
  fi

  if [ "$PRUNE_VOLUMES" = "true" ]; then
    if [ -n "$PRUNE_UNTIL" ]; then
      log "Volume prune does not support the until filter; pruning all unused volumes"
    fi

    run_docker_command "Pruning unused Docker volumes" docker volume prune -f || errors=$((errors + 1))
  else
    log "Skipping Docker volume prune"
  fi

  log "After disk usage:"
  df -h 2>&1 | tee -a "$LOG_FILE" || true

  log "After Docker usage:"
  docker system df 2>&1 | tee -a "$LOG_FILE" || true

  local used_percent
  local free_space

  used_percent="$(df -h / | awk 'NR==2 {print $5}')"
  free_space="$(df -h / | awk 'NR==2 {print $4}')"

  if [ "$errors" -gt 0 ]; then
    notify "failure" \
      "HA Docker Cleaner had errors" \
      "Docker cleanup finished with ${errors} error(s).

Disk usage: ${used_percent}
Free space: ${free_space}

Log: /share/ha-docker-cleaner.log"

    log "HA Docker Cleaner finished with ${errors} error(s)"
  else
    local title="HA Docker Cleaner finished"
    local result_text="Docker cleanup completed successfully."

    if [ "$DRY_RUN" = "true" ]; then
      title="HA Docker Cleaner dry run finished"
      result_text="Dry run completed successfully. No Docker resources were removed."
    fi

    notify "success" \
      "$title" \
      "${result_text}

Disk usage: ${used_percent}
Free space: ${free_space}

Log: /share/ha-docker-cleaner.log"

    log "HA Docker Cleaner finished successfully"
  fi

  log ""
}

# -----------------------------
# Main loop
# -----------------------------

log "HA Docker Cleaner add-on started"
log "Configured schedule: ${RUN_DAY} at ${RUN_HOUR}:00"
log "Run on start: ${RUN_ON_START:-false}"
log "Run on start delay: ${RUN_ON_START_DELAY:-900} seconds"
log "Volume pruning enabled: ${PRUNE_VOLUMES}"
log "Network pruning enabled: ${PRUNE_NETWORKS}"
log "Dry run: ${DRY_RUN}"
log "Prune age filter: ${PRUNE_UNTIL:-disabled}"

if [ "${RUN_ON_START:-false}" = "true" ]; then
  if [ "${RUN_ON_START_DELAY:-900}" -gt 0 ]; then
    log "run_on_start is enabled; waiting ${RUN_ON_START_DELAY:-900} seconds before cleanup"
    sleep "${RUN_ON_START_DELAY:-900}"
  else
    log "run_on_start is enabled; running cleanup immediately"
  fi

  run_cleanup
fi

LAST_RUN_DATE=""

while true; do
  CURRENT_DAY="$(date '+%u')"
  CURRENT_HOUR="$(date '+%H')"
  CURRENT_DATE="$(date '+%Y-%m-%d')"

  if [ "$CURRENT_DAY" = "$TARGET_DAY" ] && [ "$CURRENT_HOUR" = "$RUN_HOUR" ] && [ "$LAST_RUN_DATE" != "$CURRENT_DATE" ]; then
    run_cleanup
    LAST_RUN_DATE="$CURRENT_DATE"
  fi

  sleep 300
done
