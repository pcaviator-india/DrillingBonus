# Deploying to Vercel (no GitHub required)

This project is deployed **straight from the local working tree** with the Vercel CLI.
There is no Git repository integration and no CI pipeline: whatever is on disk is what
gets built and published.

## One-time setup (already done for this project)

```powershell
npm i -g vercel        # Vercel CLI
vercel login           # account: logisticachilerecon-1640
vercel link            # creates .vercel/project.json -> team "recon9", project "drillingbonus"
node push-env.mjs      # uploads every var in .env to the Production environment
vercel env ls production
```

Current production environment variables: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`,
`WORKERA_*`, `COREPLAN_*`. `.env` itself is **never uploaded** (see `.vercelignore`),
so the deployment always reads the values stored in the Vercel project.

## Deploy

```powershell
pnpm deploy:prod       # production  -> aliased to https://drillingbonus.vercel.app
pnpm deploy:preview    # throwaway preview URL
```

Equivalent raw CLI calls:

```powershell
$env:NO_UPDATE_NOTIFIER = '1'   # avoids the interactive "upgrade Vercel CLI?" prompt
vercel deploy --prod --yes
```

The CLI prints the immutable deployment URL (e.g.
`https://drillingbonus-xxxx-recon9.vercel.app`) and the alias that now serves it.

## What Vercel runs

1. Detects `pnpm-lock.yaml` (lockfile v9) and installs with **pnpm@10.x**
   (`package.json` has no `packageManager` pin, so Vercel uses its default for the
   project creation date).
2. Dependency install scripts are gated by `pnpm-workspace.yaml`
   (`onlyBuiltDependencies` for pnpm 9/10, `allowBuilds` for pnpm 11) and the root
   `postinstall` runs `prisma generate`.
3. Build command: `prisma generate && next build` (from `package.json`).

## Verify a deployment

```powershell
vercel ls                                  # deployments, newest first
vercel inspect <deployment-url> --logs     # full remote build log
curl.exe -s -o NUL -w '%{http_code}' https://drillingbonus.vercel.app/login   # 200
```

`/` and every dashboard route answer `307` when unauthenticated (redirect to `/login`).

## Database schema changes

Prisma migrations are **not** used in this repo; the schema is pushed directly:

```powershell
# 1. edit prisma/schema.prisma
pnpm exec prisma migrate diff --from-schema-datasource prisma/schema.prisma `
    --to-schema-datamodel prisma/schema.prisma --script   # preview drift (read-only)
pnpm db:push     # apply to the database in .env (shared Neon instance)
```

Deploying does not touch the database schema — run `pnpm db:push` yourself when the
schema changes, otherwise the deployed app queries columns that do not exist.

## Local notes

- `tsconfig.json` excludes `scripts/` from type checking: those are dev/seed/diagnostic
  helpers run through `tsx`, and a stale scratch script must never fail a deploy.
  `src/` stays strictly type-checked.
- On Windows, stop `next dev` before running `prisma generate`; the running server
  keeps `query_engine-windows.dll.node` locked and the generate step fails with `EPERM`.
