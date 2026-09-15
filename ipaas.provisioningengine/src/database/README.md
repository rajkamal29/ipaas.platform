# Database

The Node implementation uses `pg` directly and intentionally avoids an ORM. PostgreSQL
client and migration behavior live under `infrastructure/postgres`; this directory keeps
the executable database-initialization entry point. Run the ordered, idempotent SQL files
in `database/init` with:

```powershell
npm run db:initialize
```

This issue provides schema initialization only. Runtime polling and request claiming are
deferred to later issues.

