# Infrastructure

## Overview

The application is deployed on Cloudflare's edge computing platform, utilizing Cloudflare Workers for hosting and D1 for database storage. The infrastructure is designed with two distinct environments (`prod` & `preview`).

## Architecture

### Deployment Environments

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

### Technology Stack

- **Runtime**: Cloudflare Workers with Node.js compatibility
- **Framework**: SvelteKit with Cloudflare adapter
- **Database**: Cloudflare D1 (SQLite-based)
- **ORM**: Drizzle
- **Build Tool**: Bun
- **Version Management**: Changesets
- **CI/CD**: GitHub Actions

### Branch Strategy

```
main (production)     → hype-prod + hype-db-prod
preview (staging)     → hype-preview + hype-db-preview
feat/* (dev)          → Local development only
```

### Database Schema

Both environments use Drizzle ORM for type-safe database operations with automatic migrations during deployment.

---

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

```bash
# Deploy schema to production database
bun run db:migration:run:cf:prod

# Deploy schema to preview database
bun run db:migration:run:cf:preview
```

### 5. Configure GitHub Secrets

In your GitHub repository, add these secrets in `prod` and `preview` [environment](https://github.com/tijptjik/hype/settings/environments/)

```
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
```

### 6. Environment Variables

Production and preview environments are configured with appropriate variables in `wrangler.toml`:

- **ENVIRONMENT**: `production` | `staging`
- **NODE_ENV**: `production` | `staging`
- **VITE_USER_NODE_ENV**: `production` | `staging`
- **API Keys**: Cloudinary & Azure Translation

### 7. Version Management with Changesets

The project uses [Changesets](https://github.com/changesets/changesets) for version management and release coordination:

```bash
# Add a changeset (documents changes for next release)
bun run cs:add

# Version packages (bumps versions, updates CHANGELOG)
bun run cs:version
```

Releases are run as part of a merge to main on the GitHub action.

**Recommended Release Workflow:**
1. **Development**: Add changesets when making significant changes
2. **Pre-release**: Run `bun run cs:version` to bump versions and update changelogs
3. **Release**: Merge to `preview` for staging validation, then `main` for production

### 8. Deploy Configuration

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

### 9. Verification Commands

```bash
# Check deployment status
bun wrangler deployments status --name=hype-prod
bun wrangler deployments status --name=hype-preview

# Monitor database
bun run db:studio:cf:prod
bun run db:studio:cf:preview

# View logs
bun wrangler tail --name=hype-prod
```

### 10. Development Workflow

1. **Feature Development**: Work on `feat/*` branches with local development
2. **Add Changesets**: Document significant changes with `bun run cs:add`
3. **Integration Testing**: Merge to `preview` branch → deploys to `hype-preview`
4. **Version Management**: Run `bun run cs:version` to prepare releases
5. **Production Release**: Merge `preview` to `main` → deploys to `hype-prod`

This setup ensures isolated environments, automated deployments, and a clear path from development to production.

## One-time Infrastructure Setup

## Add Domain 

https://dash.cloudflare.com/a6eeace4b6d9f8e07ab307964e74d801/workers/services/view/hype-prod/production/settings

## Bind D1 to worker

https://dash.cloudflare.com/a6eeace4b6d9f8e07ab307964e74d801/workers/services/view/hype-preview/production/bindings

## Upload Secrets

For all the secrets defined in .env, upload them manually with wrangler

```bash
# Replace <KEY> with the Env Variable you want to set
npx wrangler secret put <KEY>
```