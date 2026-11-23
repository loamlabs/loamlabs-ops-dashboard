#!/usr/bin/env bash
# docker/alpina/entrypoint.sh  Alpina stock job: the container's only program.
#  1. gets the code from GitHub (public repo loamlabs/loamlabs-ops-dashboard, branch REPO_REF, default main) and installs the one package it needs (resend, for the alert email)
#  2. runs a self-test (no network to Hoss, no secrets) and writes the answer to /data/results
#  3. then loops forever (every 30 seconds): runs any COMMAND FILE Jerry drops into /data/commands, and once a day at 5:40 am (New York time, plus up to 15 minutes of random delay)
#     calls the scheduled command, which skips itself until 3 days have passed since the last run.
# Command files (create an empty or one-line text file with this exact name in the NAS folder docker/alpina/data/commands):
#   selftest.txt   read-now.txt   approve.txt (one number inside)   apply-now.txt   undo.txt (the undo file name inside)   pause.txt   resume.txt   status.txt
# Every answer is written to /data/results/<command>_<time>.txt and copied to /data/LAST_RESULT.txt. The job log is /data/job.log.
# Test hooks (not used on the NAS): DATA_DIR, APP_DIR, SKIP_INSTALL=1, ONESHOT=1 (process the command files once and exit), FAKE_NOW_EPOCH.
set -u
DATA="${DATA_DIR:-/data}"; APP="${APP_DIR:-/app}"; REF="${REPO_REF:-main}"
CMDS="$DATA/commands"; RES="$DATA/results"; REP="$DATA/reports"; STATE="$DATA/state.json"
mkdir -p "$CMDS/done" "$RES" "$REP"
log() { printf '%s %s\n' "$(date '+%F %T %Z')" "$*" | tee -a "$DATA/job.log"; }

# a value that is empty or still the placeholder TYPE_HERE counts as "not typed yet" (so the job never tries to sign in with a placeholder)
typed() { local v="${!1:-}"; case "$v" in ""|TYPE_*) return 1 ;; esac; return 0; }
login_ready() { local m=""; for v in HOSS_LOGIN_USER HOSS_LOGIN_PASSWORD SHOPIFY_SHOP_NAME SHOPIFY_CLIENT_ID SHOPIFY_CLIENT_SECRET; do typed "$v" || m="$m $v"; done; [ -z "$m" ] && return 0; MISSING="$m"; return 1; }
mail_ready() { typed RESEND_API_KEY && typed REPORT_EMAIL; }

install_code() {
  [ "${SKIP_INSTALL:-0}" = "1" ] && return 0
  log "getting the code: branch $REF of loamlabs/loamlabs-ops-dashboard"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq git ca-certificates tzdata >/dev/null 2>&1
  rm -rf /tmp/src "$APP"; mkdir -p "$APP"
  if ! git clone --quiet --depth 1 --branch "$REF" https://github.com/loamlabs/loamlabs-ops-dashboard.git /tmp/src; then log "FAILED: could not download the code from GitHub (branch $REF). Check the NAS internet connection, then Stop and Start the project."; return 1; fi
  mkdir -p "$APP/lib" "$APP/tests/fixtures" "$APP/docs"
  cp /tmp/src/lib/alpina-hoss*.js "$APP/lib/" && cp /tmp/src/tests/alpina-hoss.test.js "$APP/tests/" && cp -r /tmp/src/tests/fixtures/alpina "$APP/tests/fixtures/" && cp /tmp/src/docs/ALPINA_*.md "$APP/docs/" 2>/dev/null
  (cd /tmp/src && git log -1 --format='%h %s') > "$DATA/code_version.txt" 2>/dev/null; rm -rf /tmp/src
  if ! ls "$APP/lib/alpina-hoss-cli.js" >/dev/null 2>&1; then log "FAILED: the branch $REF has no Alpina job yet (merge the pull request first, or set REPO_REF=alpina-hoss-stock)"; return 1; fi
  (cd "$APP" && echo '{"name":"alpina-job","private":true}' > package.json && npm install --silent --no-audit --no-fund resend@3.2.0 >/dev/null 2>&1) || { log "FAILED: could not install the email package (resend)"; return 1; }
  log "code ready: $(cat "$DATA/code_version.txt" 2>/dev/null)"
}

# run one command; the answer goes to a file
run_cmd() {
  local name="$1" arg="$2" ts out; ts="$(date '+%Y-%m-%d_%H%M%S')"; out="$RES/${name}_${ts}.txt"
  log "command: $name ${arg:+($arg)}"
  { echo "COMMAND $name   $(date '+%F %T %Z')   code: $(cat "$DATA/code_version.txt" 2>/dev/null)"; echo
    case "$name" in
      selftest)   (cd "$APP" && node --test tests/alpina-hoss.test.js 2>&1 | grep -E '^# (tests|pass|fail)|^not ok') ; echo; echo "(self-test: it passes when 'fail 0' is shown above. No Hoss, no Shopify, no secrets are used.)" ;;
      read-now)   if login_ready; then (cd "$APP" && node lib/alpina-hoss-cli.js --live-read --force --out "$REP" --state "$STATE" 2>&1); else echo "NOT RUN. These values are not typed yet in the project settings:$MISSING"; fi ;;
      approve)    if ! [[ "$arg" =~ ^[0-9]{1,4}$ ]]; then echo "NOT RUN. approve.txt must contain only the number of changes from the baseline report (digits only)."; elif login_ready; then (cd "$APP" && node lib/alpina-hoss-cli.js --live-read --force --apply --approve-baseline --limit "$arg" --out "$REP" --state "$STATE" 2>&1); else echo "NOT RUN. Not typed yet:$MISSING"; fi ;;
      apply-now)  if login_ready; then (cd "$APP" && node lib/alpina-hoss-cli.js --live-read --force --apply --out "$REP" --state "$STATE" 2>&1); else echo "NOT RUN. Not typed yet:$MISSING"; fi ;;
      undo)       if [[ "$arg" =~ ^alpina_undo_[0-9-]+\.json$ ]] && [ -f "$REP/$arg" ]; then (cd "$APP" && node lib/alpina-hoss-undo.js "$REP/$arg" 2>&1); else echo "NOT RUN. undo.txt must contain the file name exactly, like alpina_undo_2026-11-25.json, and that file must be in the reports folder. Files there: $(ls "$REP" | grep alpina_undo_ | tr '\n' ' ')"; fi ;;
      pause)      touch "$DATA/PAUSED"; echo "PAUSED: scheduled runs are skipped until you create resume.txt. Nothing else changed." ;;
      resume)     rm -f "$DATA/PAUSED"; echo "RESUMED: scheduled runs continue. Next run: $(next_run_text)" ;;
      status)     echo "paused: $([ -f "$DATA/PAUSED" ] && echo YES || echo no)"; echo "next scheduled check: $(next_run_text)"; echo "login values typed: $(login_ready && echo yes || echo "NO, missing:$MISSING")"; echo "alert email ready: $(mail_ready && echo yes || echo "NO (RESEND_API_KEY / REPORT_EMAIL not typed)")"; echo "state:"; cat "$STATE" 2>/dev/null || echo "  (no run yet)"; echo; echo "reports:"; ls -1t "$REP" 2>/dev/null | head -12; echo; echo "last log lines:"; tail -8 "$DATA/job.log" ;;
      *)          echo "unknown command $name" ;;
    esac; } > "$out" 2>&1
  cp "$out" "$DATA/LAST_RESULT.txt"; log "answer written: $out"
}

process_commands() {
  for f in "$CMDS"/*.txt; do
    [ -e "$f" ] || continue
    local base name arg; base="$(basename "$f")"; name="${base%.txt}"; arg="$(head -c 200 "$f" | tr -d '\r\n ' )"
    case "$name" in selftest|read-now|approve|apply-now|undo|pause|resume|status) ;; *) mv "$f" "$CMDS/done/${base}.unknown"; log "ignored unknown command file $base"; continue ;; esac
    mv "$f" "$CMDS/done/${base}.$(date +%s)"; run_cmd "$name" "$arg"
  done
}

now_epoch() { echo "${FAKE_NOW_EPOCH:-$(date +%s)}"; }
# the next 5:40 am (New York time) plus 0 to 14 minutes of random delay
compute_next() { local n t; n="$(now_epoch)"; t="$(date -d 'today 05:40' +%s)"; [ "$t" -le "$n" ] && t="$(date -d 'tomorrow 05:40' +%s)"; echo $((t + (RANDOM % 900))) > "$DATA/next_run_epoch"; }
next_run_text() { [ -f "$DATA/next_run_epoch" ] || compute_next; date -d "@$(cat "$DATA/next_run_epoch")" '+%F %T %Z'; }

scheduled_run() {
  if [ -f "$DATA/PAUSED" ]; then log "scheduled check skipped: the job is PAUSED (create resume.txt to continue)"; return; fi
  if ! login_ready; then log "scheduled check skipped: these values are not typed yet in the project settings:$MISSING"; return; fi
  log "scheduled check"; ts="$(date '+%Y-%m-%d_%H%M%S')"
  (cd "$APP" && node lib/alpina-hoss-cli.js --live-read --apply --scheduled --out "$REP" --state "$STATE" 2>&1) > "$RES/scheduled_${ts}.txt"; local code=$?
  cp "$RES/scheduled_${ts}.txt" "$DATA/LAST_RESULT.txt"; log "scheduled check finished (exit code $code): $(grep -m1 -E 'skipped|DONE|BASELINE|STOPPED|NOTHING|changed nothing' "$RES/scheduled_${ts}.txt" | cut -c1-160)"
}

main() {
  log "job starting (timezone ${TZ:-unset}); data folder $DATA"
  install_code || { log "the code could not be set up: the job is idle. Read the line above, fix it, then Stop and Start the project."; [ "${ONESHOT:-0}" = "1" ] && return 1; while true; do sleep 3600; done; }
  run_cmd selftest ""
  [ "${1:-}" = "selftest" ] && return 0
  compute_next; log "next scheduled check: $(next_run_text)"
  while true; do
    process_commands
    [ "${ONESHOT:-0}" = "1" ] && return 0
    if [ "$(now_epoch)" -ge "$(cat "$DATA/next_run_epoch")" ]; then scheduled_run; compute_next; log "next scheduled check: $(next_run_text)"; fi
    sleep 30
  done
}
[ "${SOURCE_ONLY:-0}" = "1" ] || main "$@"
