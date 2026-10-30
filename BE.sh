#!/bin/bash
cd /root/lead-finder-project/backend && source .venv/bin/activate || exit 1

if ! python -c "import app.main" >/tmp/import_check.log 2>&1; then
  echo "Import check FAILED. Not restarting. Error:"
  tail -n 15 /tmp/import_check.log
  exit 1
fi

systemctl reset-failed lead-finder-backend.service
systemctl restart lead-finder-backend.service
sleep 20
if systemctl is-active --quiet lead-finder-backend.service; then
  echo "Backend restarted OK"
else
  echo "Backend FAILED. Last logs:"
  journalctl -u lead-finder-backend.service -n 30 --no-pager
fi
