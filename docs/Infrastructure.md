# Infrastructure

## Table of Contents
- [1. Prerequisites](#1-prerequisites)
- [2. Create Cloudflare Resources](#2-create-cloudflare-resources)
- [3. Configure Database IDs](#3-configure-database-ids)
- [4. Run Initial Database Migrations](#4-run-initial-database-migrations)
- [5. Configure GitHub Secrets](#5-configure-github-secrets)
- [6. Environment Variables](#6-environment-variables)
- [7. Deploy Configuration](#7-deploy-configuration)
- [8. Upload Secrets](#8-upload-secrets)
- [9. Google OAuth](#9-google-oauth)

Steps to recreate the infrastructure on Cloudflare and Google. 

## 1. Prerequisites

Ensure you have:

- Cloudflare account with Workers access
- GitHub repository with appropriate permissions
- Wrangler CLI installed locally
- Bun runtime installed

## 2. Create Cloudflare Resources

### Create D1 Databases

```sh
# Authenticate with Cloudflare
bun wrangler login
# Create production database
bun wrangler d1 create hype-db-prod

# Create preview database
bun wrangler d1 create hype-db-preview
```

## 3. Configure Database IDs

Update `wrangler.toml` with the database IDs returned from the create commands:

```toml
# Production environment
[[env.production.d1_databases]]
binding = "DB"
database_name = "hype-db-prod"
database_id = "YOUR_PROD_DATABASE_ID"

# Preview environment
[[env.preview.d1_databases]]
binding = "DB"
database_name = "hype-db-preview"
database_id = "YOUR_PREVIEW_DATABASE_ID"
```

## 4. Run Initial Database Migrations

First seed the database with the initial schema

```bash
# Deploy schema to production database
bunx wrangler d1 execute hype-db-prod --env production --remote --file=sql/data/init_schema.sql

# Deploy schema to preview database
bunx wrangler d1 execute hype-db-preview --env preview --remote --file=sql/data/init_schema.sql
```

load in data

```bash
# Deploy schema to production database
bunx wrangler d1 execute hype-db-prod --env production --remote --file=sql/data/init_data_{01,02,03}.sql

# Deploy schema to preview database
bunx wrangler d1 execute hype-db-preview --env preview --remote --file=sql/data/init_data_{01,02,03}.sql
```

and apply any migrations

```bash
# Deploy schema to production database
bun run db:migration:run:cf:prod

# Deploy schema to preview database
bun run db:migration:run:cf:preview
```

## 5. Configure GitHub Secrets

In your GitHub repository, add Cloudflare credentials in `prod` and `preview` [environments](https://github.com/tijptjik/hype/settings/environments/)

```
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
```

Then add in the other secrets the build relies on. See `dev.vars.production` and `dev.vars.preview` for the keys and values.

## 6. Environment Variables

Ensure that you have setup the environment variables in the correct places as detailed in the **Environment Variables** section of the Infra docs.

```
.dev.vars                    # SECRET, local only, platform.env.{VAR}
.dev.vars.preview            # SECRET, reference only, platform.env.{VAR}
.dev.vars.production         # SECRET, reference only, platform.env.{VAR}
.env                         # PUBLIC, all envs, $env/static/public
.env.development             # PUBLIC, dev only, $env/static/public
.env.preview                 # PUBLIC, preview only, $env/static/public
.env.prod                    # PUBLIC, prod only, $env/static/public
.env.drizzle.preview.local   # SECRET, drizzle studio only, N/A
.env.drizzle.prod.local      # SECRET, drizzle studio, N/A
|                               |         |             |
|                               |         |             +---> Runtime Access 
|                               |         +---> Environment / Context       
|                               +---> Public or Secret 
|
+-------> filename, .env* is read by VITE, .dev.vars* is a cloudflare spec
```

Variables in `.env.{mode}` combine with `.env.{mode}`, variables in the former override ones in the latter if they conflict.

## 7. Deploy Configuration

The GitHub Actions workflow (`.github/workflows/deploy.yml`) uses separate jobs for each environment:

**Production Job** (`deploy-to-prod`):

- **Triggers**: Pushes to `main` branch only
- **Environment**: Uses GitHub `production` environment for secrets
- **Deploys**: `hype-prod` worker and `hype-db-prod` database

**Preview Job** (`deploy-to-preview`):

- **Triggers**: Pushes to `preview` branch only
- **Environment**: Uses GitHub `preview` environment for secrets
- **Deploys**: `hype-preview` worker and `hype-db-preview` database

Both jobs:

1. **Install** Bun and project dependencies
2. **Build** the application with environment-specific configuration
3. **Migrate** database schema if needed
4. **Deploy** to the corresponding Cloudflare Worker

## 8. Upload Secrets

Upon a succesful deployment, the worker resources should have been created.

For all the secrets defined in .env, upload them manually with wrangler. To both production and preview environment:

```bash
# PROD: Replace <KEY> with the Env Variable you want to set
npx wrangler secret put <KEY>
```

```bash
# Replace <KEY> with the Env Variable you want to set
npx wrangler secret put --env preview <KEY>
```

## 9. Google OAuth

Vist the [Google Cloud Console](https://console.cloud.google.com/auth/clients/234870059065-fb1jvv6e72jb7ogtd755424bjm8pqgij.apps.googleusercontent.com?inv=1&invt=Abz-Pg&project=hypehk) and add `{https://domain.tld}` to the Authorized JavaScript origins and `{https://domain.tld/api/auth/callback/google}` to the Authorized redirect URIs.
