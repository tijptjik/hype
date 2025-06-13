# Architecture 

The application is deployed on Cloudflare's edge computing platform, utilizing Cloudflare Workers for hosting and D1 for database storage. The infrastructure is designed with two distinct environments (`prod` & `preview`).

## Table of Contents
- [Technology Stack](#technology-stack)
- [Deployment Environments](#deployment-environments)
  - [Branch Strategy](#branch-strategy)
- [Database Schema](#database-schema)
- [Environment Variables](#environment-variables)
- [Mode selection](#mode-selection)

## Technology Stack

- **Runtime**: Cloudflare Workers with Node.js compatibility
- **Framework**: SvelteKit with Cloudflare adapter
- **Database**: Cloudflare D1 (SQLite-based)
- **ORM**: Drizzle
- **Build Tool**: Vite
- **Local Runtime**: Bun
- **Version Management**: Changesets
- **CI/CD**: GitHub Actions

## Deployment Environments

**Production Environment**

- **Worker**: `hype-prod`
- **Database**: `hype-db-prod`
- **Trigger**: Deployments from `main` branch
- **URL**: [hype.hk](https://hype.hk)
- **Configuration**: Full production settings with optimizations

**Preview Environment**

- **Worker**: `hype-preview`
- **Database**: `hype-db-preview`
- **Trigger**: Deployments from `preview` branch
- **URL**: [preview.hype.hk](https://preview.hype.hk)
- **Configuration**: Staging settings for testing

### Branch Strategy

```
main (production)     → hype-prod + hype-db-prod
preview (preview)     → hype-preview + hype-db-preview
feat/* (dev)          → Local development only
```

### Database Schema

Both environments use Drizzle ORM for type-safe database operations with automatic migrations during deployment. The schema are available in /src/lib/db/schema/{domain}.ts

### Environment Variables

The following table summarizes the environment variable files used in the project. Each file is used for a specific context (dev, preview, production, drizzle, etc). Files marked with \* are picked up by the @cloudflare/vite-plugin.

| File                       | PUBLIC | SECRET | DEV | PREVIEW | PROD | DRIZZLE |
|----------------------------|--------|--------|-----|---------|------|---------|
| .dev.vars\*                |        | ✓      | ✓   |         |      |         |
| .dev.vars.preview          |        | ✓      |     | #       |      |         |
| .dev.vars.production       |        | ✓      |     |         | #    |         |
| .env.drizzle.preview.local |        | ✓      |     |         |      | ✓       |
| .env.drizzle.prod.local    |        | ✓      |     |         |      | ✓       |
| .env                       | ✓      |        | ✓   | ✓       | ✓    |         |
| .env.development           | ✓      |        | ✓   |         |      |         |
| .env.preview               | ✓      |        |     | ✓       |      |         |
| .env.prod                  | ✓      |        |     |         | ✓    |         |

`#` - Each of the variables herein are uploaded the worker's secret using Wrangler. They are just maintained as a local reference what variables are available in the worker runtimes.

**Legend:**

- PUBLIC: Contains public (non-secret) variables, must be checked into git
- SECRET: Contains secrets, must NOT be checked into git (should be in .gitignore)
- DEV: Used for local development
- PREVIEW: Used for preview deployments
- PROD: Used for production deployments
- DRIZZLE: Used for DrizzleKit Studio

**Notes:**

- Files marked with \* (e.g. `.dev.vars`) are picked up by the @cloudflare/vite-plugin to simulate the secrets available to a worker in  Cloudflare.
- Vite is used as the development server AND the build on GitHub Actions. While is does not run on the Cloudflare Workers, the env vars that it offers in the development server are also available in the builds (e.g. `import.meta.env.PROD` is avaiable in a cloudflare worker environment, even without loading it explicitly.)
- For SECRETs, you must add them to GitHub repository settings to be available in GitHub Actions, and to the worker's secret variables using Wrangler to be available at runtime in Cloudflare Workers.
- All SECRET files must be added to `.gitignore` to prevent accidental commits. PUBLIC vars **must** be checked into git for correct operation in all environments.
- We do NOT need to configure vars in `wrangler.toml` - public vars are picked up from `.env` + `.env.{environment}` and secret vars are stored in the worker config (manually uploaded one by one with wrangler CLI commands).
- We must inject secrets into environments in `deploy.yml` for them to be available.
- We do NOT need to inject public vars, as these are available from `.env` + `.env.{environment}`, which are all available in the repository.

#### Mode selection

The correct set of environment variables is determined by setting the right mode / environment for the tool reading in the env vars.

- **DEV** : 
    - all commands default to running against the local 'development' mode.
    - `wrangler {command} --env {production,preview}` 
    - `vite {command} --mode {production,preview}` 
- **GITHUB** (unsure whether the CLOUDFLARE_ENV is necessary, but technically it picks up the right environment from wrangler.toml when running with @cloudflare/vite-plugin. We currently do NOT build with it though, as it's not yet supported with sveltekit, but in the future this will undoubdtedly be necessary.): 
    - `CLOUDFLARE_ENV=production vite {ACTION} --mode production`
    - `CLOUDFLARE_ENV=preview vite {ACTION} --mode preview` 
- **WORKER** :
    - These are picked up from the build and the worker environment, no special invocations are required.
- **DRIZZLE** (we have to extract the vars which Drizzle actually uses as the use of the CLOUDFLARE_D1_TOKEN conflicts with the authentication setup): 
    - `export $(xargs <.env.drizzle.prod.local) && drizzle-kit studio` 
    - `export $(xargs <.env.drizzle.preview.local) && drizzle-kit studio` 
---