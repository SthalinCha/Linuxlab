# Fix Host Terminal Prompt

## Problem
Terminal opens showing `linuxlab@centauri:~$` instead of `ubuntu@centauri:~$`.

## Changes

### 1. `backend/app/api/v1/ws.py` (line 64)
Set PS1 environment variable before spawning bash:
```python
cmd = "/bin/bash"
my_env = os.environ.copy()
my_env["PS1"] = "ubuntu@\\h:\\w\\$ "
child = pexpect.spawn(cmd, timeout=None, encoding="utf-8", codec_errors="replace", env=my_env)
```

### 2. Rebuild and restart backend
```bash
docker compose build backend && docker compose up -d backend
```

## Result
`ubuntu@centauri:~$` — prompt exacto que pide el usuario.
