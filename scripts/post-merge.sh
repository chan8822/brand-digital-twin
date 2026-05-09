#!/bin/bash
set -e

pnpm install --frozen-lockfile

# `drizzle-kit push` mutates whatever database $DATABASE_URL points at,
# with no migration history and no review step. Running it on every
# merge is dangerous, so it's now opt-in. Set TANMATRA_AUTO_DB_PUSH=1
# in environments where the DB is disposable (e.g. dev Replit).
if [ "${TANMATRA_AUTO_DB_PUSH:-0}" = "1" ]; then
  echo "TANMATRA_AUTO_DB_PUSH=1 — running drizzle-kit push"
  pnpm --filter db push
else
  echo "post-merge: skipping drizzle-kit push (set TANMATRA_AUTO_DB_PUSH=1 to enable)"
fi
