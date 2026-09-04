#!/bin/bash
# Runs automatically on first container start (empty data directory only).
# Creates the pgcrypto extension used by the `credentials` table's
# AES-256-GCM encryption (lib/crypto.js). Temporal database creation was
# removed here — Temporal is no longer part of this project (custom
# orchestration, see lib/orchestration/).
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
EOSQL
