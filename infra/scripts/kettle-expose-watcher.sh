#!/usr/bin/env bash
set -o pipefail

# Kettle N4 watcher (REQUIREMENTS §7.7): gives each `running` agent_runs row a
# lifecycle-bound NetBird URL via `netbird expose`, and tears it down when the run
# finishes. Runs on the VM-A host (not in Docker) — the worker container never gets
# the NetBird socket/binary, so this is the only thing that calls `netbird expose`.
#
# Talks to Supabase over PostgREST with the service-role key already on this host
# (same one the app containers use). No new migration, no worker change: state lives
# entirely in the existing agent_runs.options jsonb column (merged, never overwritten).
#
# Env (sourced from /opt/kettle/current/web/.env, root-only, 600 perms):
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

ENV_FILE="${ENV_FILE:-/opt/kettle/current/web/.env}"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${SUPABASE_URL:?SUPABASE_URL not set}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY not set}"

MAX_EXPOSURES=10
POLL_INTERVAL="${POLL_INTERVAL:-10}"

log() { echo "[kettle-expose-watcher] $(date -u +%FT%TZ) $*"; }

# pg METHOD path [json-body]
pg() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -f -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
  if [ -n "$body" ]; then
    args+=(-H "Content-Type: application/json" -H "Prefer: return=representation" -X "$method" -d "$body")
  else
    args+=(-X "$method")
  fi
  curl "${args[@]}" "$SUPABASE_URL/rest/v1/$path"
}

declare -A RUN_PID # run_id -> pid of its `netbird expose` process

# On start, we have no in-memory state, so any `netbird expose --with-name-prefix
# run-*` process already alive must be an orphan from a previous crash of this
# watcher. Kill them all; the main loop below will start fresh exposures for any
# still-`running` agent_runs that need one.
reconcile_orphans() {
  local pids
  pids=$(pgrep -f 'netbird expose .*--with-name-prefix run-' || true)
  if [ -n "$pids" ]; then
    log "killing orphaned netbird expose process(es) from a previous run: $pids"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
  fi
}

start_expose() {
  local run_id="$1" short pin logf pid tries url current merged now
  short="${run_id:0:8}"
  pin=$(( (RANDOM * 32768 + RANDOM) % 1000000 ))
  pin=$(printf '%06d' "$pin")
  logf="/tmp/kettle-expose-${short}.log"
  : >"$logf"

  netbird expose 3000 --with-pin "$pin" --with-name-prefix "run-$short" >"$logf" 2>&1 &
  pid=$!
  disown "$pid"
  RUN_PID["$run_id"]="$pid"

  url=""
  tries=0
  while [ "$tries" -lt 10 ]; do
    url=$(grep -oE 'URL:[[:space:]]*\S+' "$logf" | awk '{print $2}')
    [ -n "$url" ] && break
    sleep 0.5
    tries=$((tries + 1))
  done

  if [ -z "$url" ]; then
    log "run $short: netbird expose did not report a URL in time, giving up on this cycle"
    kill "$pid" 2>/dev/null || true
    unset "RUN_PID[$run_id]"
    return
  fi

  current=$(pg GET "agent_runs?id=eq.$run_id&select=options" | jq -c '.[0].options // {}')
  now=$(date -u +%FT%TZ)
  merged=$(jq -c --arg url "$url" --arg pin "$pin" --arg now "$now" \
    '. + {expose_url: $url, expose_pin: $pin, expose_started_at: $now}' <<<"$current")
  pg PATCH "agent_runs?id=eq.$run_id" "{\"options\": $merged}" >/dev/null

  log "run $short: exposed (url/pin not logged)"
}

stop_expose() {
  local run_id="$1" short pid current merged now
  short="${run_id:0:8}"
  pid="${RUN_PID[$run_id]:-}"
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null || true
    unset "RUN_PID[$run_id]"
  fi

  current=$(pg GET "agent_runs?id=eq.$run_id&select=options" | jq -c '.[0].options // {}')
  now=$(date -u +%FT%TZ)
  merged=$(jq -c --arg now "$now" '. + {expose_ended_at: $now}' <<<"$current")
  pg PATCH "agent_runs?id=eq.$run_id" "{\"options\": $merged}" >/dev/null

  log "run $short: expose torn down"
}

reconcile_orphans
log "watcher started, polling every ${POLL_INTERVAL}s (max ${MAX_EXPOSURES} concurrent exposures)"

while true; do
  rows=$(pg GET "agent_runs?select=id,options&status=eq.running" 2>/dev/null) || rows="[]"

  while read -r row; do
    [ -z "$row" ] && continue
    id=$(jq -r '.id' <<<"$row")
    has_url=$(jq -r '.options.expose_url // empty' <<<"$row")
    if [ -z "$has_url" ] && [ -z "${RUN_PID[$id]:-}" ]; then
      if [ "${#RUN_PID[@]}" -ge "$MAX_EXPOSURES" ]; then
        log "skipping run ${id:0:8}: at NetBird's ${MAX_EXPOSURES}-per-peer expose limit"
      else
        start_expose "$id"
      fi
    fi
  done < <(jq -c '.[]' <<<"$rows")

  # Tear down anything we're tracking whose run has left the `running` state.
  for id in "${!RUN_PID[@]}"; do
    status=$(pg GET "agent_runs?id=eq.$id&select=status" 2>/dev/null | jq -r '.[0].status // "unknown"')
    if [ "$status" != "running" ]; then
      stop_expose "$id"
    fi
  done

  sleep "$POLL_INTERVAL"
done
