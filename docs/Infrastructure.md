# Infrastructure

## Table of Contents
- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Setup Instructions](#setup-instructions)
  - [1. Prerequisites](#1-prerequisites)
  - [2. Create Cloudflare Resources](#2-create-cloudflare-resources)
  - [3. Configure Database IDs](#3-configure-database-ids)
  - [4. Run Initial Database Migrations](#4-run-initial-database-migrations)
  - [5. Configure GitHub Secrets](#5-configure-github-secrets)
  - [6. Environment Variables](#6-environment-variables)
  - [7. Upload Secrets](#7-upload-secrets)
  - [8. Google OAuth](#8-google-oauth)

## Overview

This project is deployed on Cloudflare's edge computing platform with a build promotion strategy. For detailed information about deployment workflows, CI/CD pipeline, and environment variables, see [Deployment.md](./Deployment.md). For architectural details, see [Architecture.md](./Architecture.md).

## Technology Stack

- **Runtime**: Cloudflare Workers with Node.js compatibility
- **Framework**: SvelteKit with Cloudflare adapter
- **Database**: Cloudflare D1 (SQLite-based)
- **ORM**: Drizzle
- **Build Tool**: Vite
- **Local Runtime**: Bun
- **Version Management**: Changesets
- **CI/CD**: GitHub Actions

## Setup Instructions

### 1. Prerequisites

Ensure you have:

- Cloudflare account with Workers access
- GitHub repository with appropriate permissions
- Wrangler CLI installed locally
- Bun runtime installed

### 2. Create Cloudflare Resources

#### Create D1 Databases

```sh
# Authenticate with Cloudflare
bun wrangler login

# Create production database
bun wrangler d1 create hype-db-prod

# Create preview database
bun wrangler d1 create hype-db-preview
```

### 3. Configure Database IDs

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

### 4. Run Initial Database Migrations

First seed the database with the initial schema:

```bash
# Deploy schema to production database
bunx wrangler d1 execute hype-db-prod --env production --remote --file=sql/data/init_schema.sql

# Deploy schema to preview database
bunx wrangler d1 execute hype-db-preview --env preview --remote --file=sql/data/init_schema.sql
```

Load in data:

```bash
# Deploy data to production database
bunx wrangler d1 execute hype-db-prod --env production --remote --file=sql/data/init_data_{01,02,03}.sql

# Deploy data to preview database
bunx wrangler d1 execute hype-db-preview --env preview --remote --file=sql/data/init_data_{01,02,03}.sql
```

Apply any migrations:

```bash
# Deploy migrations to production database
bun run db:migration:run:cf:production

# Deploy migrations to preview database
bun run db:migration:run:cf:preview
```

### 5. Configure GitHub Secrets

In your GitHub repository, add Cloudflare credentials in `prod` and `preview` [environments](https://github.com/tijptjik/hype/settings/environments/):

```
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
```

Then add the other secrets the build relies on. See `.dev.vars.production` and `.dev.vars.preview` for the keys and values.

### 6. Environment Variables

Public environment variables are configured in `wrangler.toml` and read at runtime. Secret variables are uploaded separately using `wrangler secret put`.

**Public Variables** (in `wrangler.toml`):
```toml
[vars]
PUBLIC_DRIZZLE_LOGGER=false
PUBLIC_SVELTE_QUERY_DEVTOOLS=false
# ... other public vars
```

For detailed information about environment variable configuration and usage patterns, see [Deployment.md](./Deployment.md).

### 7. Upload Secrets

Upon a successful deployment, the worker resources should have been created.

For all the secrets defined in `.dev.vars.*`, upload them manually with wrangler to both production and preview environments:

```bash
# PRODUCTION: Replace <KEY> with the Env Variable you want to set
npx wrangler secret put <KEY> --env production

# PREVIEW: Replace <KEY> with the Env Variable you want to set
npx wrangler secret put <KEY> --env preview
```

### 8. Google OAuth

Visit the [Google Cloud Console](https://console.cloud.google.com/auth/clients/234870059065-fb1jvv6e72jb7ogtd755424bjm8pqgij.apps.googleusercontent.com?inv=1&invt=Abz-Pg&project=hypehk) and add `{https://domain.tld}` to the Authorized JavaScript origins and `{https://domain.tld/api/auth/callback/google}` to the Authorized redirect URIs.
