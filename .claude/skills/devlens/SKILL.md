---
name: devlens
description: Show the Devlens dashboard URL and status
---

Show the Devlens dashboard status by reading the runtime file:

```!
cat "$CLAUDE_PROJECT_DIR/.devlens/runtime.json" 2>/dev/null || echo "NOT_RUNNING"
```

If the output is NOT_RUNNING, tell the user Devlens is not running and suggest they restart their Claude Code session.

Otherwise, parse the JSON and display a clean summary:
- Local URL: http://localhost:{port}
- Network URLs: http://{each ip}:{port}
- PID and start time
