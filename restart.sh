#!/bin/bash
# Usage:
#   bash restart.sh              -> backend + frontend dono
#   bash restart.sh backend      -> sirf backend
#   bash restart.sh frontend     -> sirf frontend
#   bash restart.sh all --build  -> frontend ka naya build karke restart

ROOT=/root/lead-finder-project
BE_SVC=lead-finder-backend.service
FE_SVC=lead-finder-frontend.service
SITE=https://leadfinder.easymsgsender.com

TARGET=${1:-all}
[ "$TARGET" = "--build" ] && TARGET=all
BUILD=0
for a in "$@"; do [ "$a" = "--build" ] && BUILD=1; done

FAILED=0
ok()   { echo "  [OK]   $1"; }
fail() { echo "  [FAIL] $1"; FAILED=1; }

wait_http() {  # name url max_seconds
  local name=$1 url=$2 max=$3 t=0 code
  while [ $t -lt $max ]; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$url")
    if [ "$code" = "200" ]; then ok "$name -> HTTP 200 (${t}s)"; return 0; fi
    sleep 2; t=$((t+2))
  done
  fail "$name -> HTTP $code after ${max}s"
  return 1
}

show_logs() { echo "  --- last logs: $1 ---"; journalctl -u "$1" -n 30 --no-pager; }

# ---------- BACKEND ----------
if [ "$TARGET" = "all" ] || [ "$TARGET" = "backend" ]; then
  echo "== Backend =="
  if ! ( cd $ROOT/backend && source .venv/bin/activate && python -c "import app.main" ) >/tmp/import_check.log 2>&1; then
    fail "Import check failed. Backend restart nahi kiya (chalta hua service safe hai)."
    tail -n 15 /tmp/import_check.log
    FAILED=1
  else
    ok "Import check passed"
    systemctl reset-failed $BE_SVC
    systemctl restart $BE_SVC
    echo "  Backend start ho raha hai (~25s)..."
  fi
fi

# ---------- FRONTEND ----------
if [ "$TARGET" = "all" ] || [ "$TARGET" = "frontend" ]; then
  echo "== Frontend =="
  BUILD_OK=1
  if [ $BUILD -eq 1 ] || [ ! -f $ROOT/frontend/.next/BUILD_ID ]; then
    [ $BUILD -eq 0 ] && echo "  .next build nahi mila, build kar raha hu..."
    if ( cd $ROOT/frontend && npm run build ); then
      ok "Build successful"
    else
      fail "Build failed. Frontend restart nahi kiya."
      BUILD_OK=0
    fi
  fi
  if [ $BUILD_OK -eq 1 ]; then
    systemctl reset-failed $FE_SVC
    systemctl restart $FE_SVC
  fi
fi

# ---------- CHECKS ----------
echo "== Checks =="
if [ "$TARGET" = "all" ] || [ "$TARGET" = "backend" ]; then
  if systemctl is-active --quiet $BE_SVC; then
    wait_http "Backend :8000/docs" http://127.0.0.1:8000/docs 90 || show_logs $BE_SVC
  else
    fail "Backend service active nahi hai"; show_logs $BE_SVC
  fi
fi
if [ "$TARGET" = "all" ] || [ "$TARGET" = "frontend" ]; then
  if systemctl is-active --quiet $FE_SVC; then
    wait_http "Frontend :3000" http://127.0.0.1:3000/ 30 || show_logs $FE_SVC
  else
    fail "Frontend service active nahi hai"; show_logs $FE_SVC
  fi
fi

if nginx -t >/dev/null 2>&1; then ok "nginx config valid"; else fail "nginx config error"; nginx -t; fi
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 $SITE/)
if [ "$code" = "200" ]; then ok "Public site $SITE -> HTTP 200"; else fail "Public site -> HTTP $code"; fi

echo
if [ $FAILED -eq 0 ]; then echo "SAB THEEK HAI: sab services restart ho gayi."; else echo "KUCH FAIL HUA: upar ke [FAIL] aur logs dekho."; fi
exit $FAILED
