# ipaas.providers

Provider adapters for the iPaaS platform — currently `@ipaas/adapter-connectwise` and `@ipaas/adapter-keka`, each an independently published npm package. Split out of `ipaas.orchestrationengine` on 2026-09-08 so both the batch Orchestration Engine and a future real-time (webhook/queue) engine can depend on the same adapter code without duplicating it.

## Layout

```
connectwise/    @ipaas/adapter-connectwise — ConnectWiseAdapter
  index.js
  logger.js
  package.json
keka/           @ipaas/adapter-keka — KekaAdapter
  index.js
  logger.js
  package.json
```

No shared root package or workspace — each folder is a complete, self-contained, independently publishable package. That's deliberate: once published and `npm install`ed elsewhere, a package can only rely on what's inside its own folder, not on relative paths into a sibling package or another repo.

## The adapter contract

Both adapters implement: `authenticate()`, `fetch(entity, opts)`, `fetchByIds(entity, ids)`, `write(entity, record)`. See each `index.js`'s own doc comments for the full contract, and `docs/LLD-orchestration-engine.md` in `ipaas.orchestrationengine` for how the engine calls them.

**Storage-agnostic by design.** Neither adapter loads or persists credentials itself — the constructor takes `(tenantId, credentials, { onCredentialsRefreshed }, logger)`. The caller (the orchestration engine) loads credentials from wherever it stores them and passes them in; if an adapter refreshes a token mid-flow (Keka's OAuth flow does this), it calls `onCredentialsRefreshed(updatedCredentials)` rather than writing to a database directly. Neither package has any dependency on Postgres, encryption, or any specific storage mechanism.

## Logging

Each package has its own small `logger.js` (pino), duplicated rather than pulled from a shared package. This is intentional, not an oversight — it keeps each package self-contained, and the duplication is a few lines. Revisit only if it becomes genuinely painful to keep the two in sync.

## Publishing

Both packages publish to GitHub Packages' npm registry (`npm.pkg.github.com`, see each `package.json`'s `publishConfig`) — not GHCR, which is a container registry and not the right target for npm packages meant to be `npm install`ed as dependencies.
