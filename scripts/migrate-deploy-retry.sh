#!/usr/bin/env bash
# `prisma migrate deploy` runs once per build against a small pooled
# Postgres (Supabase's Supavisor in session mode, capped at 15 clients —
# see src/lib/prisma.ts). A burst of concurrent builds/traffic can
# transiently exhaust that pool right as this step tries to connect. Retry
# a few times with backoff before failing the build outright.
set -euo pipefail

attempts=3
delay=5

for ((i = 1; i <= attempts; i++)); do
  if npx prisma migrate deploy; then
    exit 0
  fi
  echo "prisma migrate deploy failed (attempt $i/$attempts)" >&2
  if [ "$i" -lt "$attempts" ]; then
    sleep "$delay"
  fi
done

echo "prisma migrate deploy failed after $attempts attempts" >&2
exit 1
