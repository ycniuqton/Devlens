---
name: devlens
description: Show the Devlens dashboard URL and status for the current project
---

Show the Devlens dashboard URLs for the current project by inspecting running processes (no AI reasoning needed — just print whatever the script returns):

```!
DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
# Match any node process running devlens (binary, dist/index.js, or symlink) for this dir
PROC=$(ps -eo pid,args 2>/dev/null | grep -E "node.*(devlens|dist/index\.js).*start.*--dir[= ]?${DIR}([ /]|$)" | grep -v grep | head -1)

if [ -z "$PROC" ]; then
  echo "DEVLENS_NOT_RUNNING for ${DIR}"
  exit 0
fi

PID=$(echo "$PROC" | awk '{print $1}')
PORT=$(echo "$PROC" | grep -oE -- "--port[= ]?[0-9]+" | grep -oE "[0-9]+" | head -1)
[ -z "$PORT" ] && PORT=$(grep -oE '"port"[[:space:]]*:[[:space:]]*[0-9]+' "${DIR}/.devlens/runtime.json" 2>/dev/null | grep -oE "[0-9]+" | head -1)

if [ -z "$PORT" ]; then
  echo "DEVLENS_RUNNING but could not determine port (PID $PID)"
  exit 0
fi

echo "DEVLENS_RUNNING"
echo "  PID:     $PID"
echo "  Project: ${DIR}"
echo "  Local:   http://localhost:${PORT}"
for ip in $(hostname -I 2>/dev/null || true); do
  case "$ip" in
    127.*|::1|fe80*|*:*) continue ;;
    *) echo "  Network: http://${ip}:${PORT}" ;;
  esac
done
```

Just print the script output verbatim. If it starts with `DEVLENS_NOT_RUNNING`, tell the user Devlens is not running for this project and suggest restarting the Claude Code session.
