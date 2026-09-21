#!/bin/sh
set -eu

container="marketingtool-postgres-test-$$"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

docker run --rm -d --name "$container" -e POSTGRES_PASSWORD=test -e POSTGRES_DB=marketingtool -p 127.0.0.1::5432 postgres:17-alpine >/dev/null
port="$(docker port "$container" 5432/tcp | sed 's/.*://')"
database_url="postgres://postgres:test@127.0.0.1:${port}/marketingtool"

until docker exec "$container" pg_isready -U postgres -d marketingtool >/dev/null 2>&1; do sleep 1; done
DATABASE_URL="$database_url" pnpm db:migrate
RUN_INTEGRATION_TESTS=1 DATABASE_URL="$database_url" pnpm exec vitest run integration/postgres.integration.test.ts
