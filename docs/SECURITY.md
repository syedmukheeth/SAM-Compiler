# SAM Compiler sandbox security (baseline)

This repo’s execution path is designed for **untrusted code**. The current scaffold enforces a baseline set of controls and is structured so additional hardening can be layered without changing the API contract.

## Current controls (worker)

- **Dedicated container per run** (`docker run --rm`)
- **No network**: `--network none`
- **Privilege reduction**:
  - no privilege escalation: `--security-opt no-new-privileges`
  - drop Linux capabilities: `--cap-drop ALL`
- **Resource limits**:
  - memory: `--memory` (default `256m`)
  - CPU: `--cpus` (default `0.5`)
  - process limit: `--pids-limit` (default `128`)
  - wall-clock timeout: worker kills the `docker` process after `RUN_TIMEOUT_MS` (default `8000`)
- **Filesystem**:
  - container root is **read-only**: `--read-only`
  - ephemeral `/tmp` as `tmpfs`: `--tmpfs /tmp:rw,noexec,nosuid,size=64m`
  - the run snapshot is mounted at `/workspace`
- **User**: container runs as **non-root** (`-u 1000:1000`)

## Recommended next hardening steps (production)

- **seccomp profile** (deny dangerous syscalls)
- **AppArmor/SELinux** (host-level policy)
- **egress proxy allowlisting** (if any outbound network is allowed)
- **artifact storage** outside Mongo (S3-compatible) with strict content-type and size limits
- **tenant fairness**: per-tenant concurrency semaphores + queue partitioning
- **runtime image scanning** in CI (vuln scanning + signed images)

