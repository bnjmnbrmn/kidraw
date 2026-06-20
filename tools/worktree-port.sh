#!/usr/bin/env bash
#
# tools/worktree-port.sh
#
# Hand out a deterministic, conflict-free `ng serve` port for a kidraw worktree.
# Several implementer agents may run in parallel worktrees (sibling directories
# under the same .git), each wanting to `npm start` without colliding on the
# default 4200.
#
# Strategy: derive an offset in [0, 49] from the worktree's absolute path,
# then add it to a base of 4200. Same path -> same port across invocations
# (stable across agent restarts; debuggable). 50 distinct slots is plenty
# for the agent count we have.
#
# Usage:
#   PORT=$(tools/worktree-port.sh)        # uses $(pwd) as the worktree path
#   PORT=$(tools/worktree-port.sh /path)  # explicit worktree path
#   npx ng serve --port "$PORT"
#
# Or as a one-liner:
#   npx ng serve --port "$(tools/worktree-port.sh)"
#
# If the chosen port is already bound (very rare collision), the script falls
# back to the next free slot in the [4200, 4249] range and reports the chosen
# port on stderr.

set -euo pipefail

# BASE_PORT may be overridden via the environment so other per-worktree
# servers (e.g. the routing-eval viewer) get their own conflict-free range
# without colliding with `ng serve`. Default is the ng-serve base, 4200.
BASE_PORT="${BASE_PORT:-4200}"
SLOT_COUNT=50

worktree="${1:-$(pwd)}"
abs_worktree="$(cd "$worktree" && pwd -P)"

# Hash the absolute path to a stable 32-bit integer, modulo the slot count.
# Use cksum (POSIX, no openssl dependency). Take the first field of cksum's
# output (a numeric CRC).
crc=$(printf '%s' "$abs_worktree" | cksum | awk '{print $1}')
offset=$(( crc % SLOT_COUNT ))
desired_port=$(( BASE_PORT + offset ))

# Check whether the port is bound. ss is POSIX-ish on Linux; fall back to
# /dev/tcp probe otherwise.
port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -lntH "( sport = :${port} )" | grep -q .
  else
    # /dev/tcp returns 0 on successful connect (port bound).
    (echo >"/dev/tcp/127.0.0.1/${port}") >/dev/null 2>&1
  fi
}

# Try desired_port first, then walk forward through the slot range.
port="$desired_port"
for i in $(seq 0 $((SLOT_COUNT - 1))); do
  candidate=$(( BASE_PORT + ((offset + i) % SLOT_COUNT) ))
  if ! port_in_use "$candidate"; then
    port="$candidate"
    break
  fi
done

if [ "$port" != "$desired_port" ]; then
  echo "worktree-port: desired ${desired_port} in use; using ${port}" >&2
fi

echo "$port"
