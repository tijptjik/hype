# Architecture 

The application is deployed on Cloudflare's edge computing platform, utilizing Cloudflare Workers for hosting and D1 for database storage. The infrastructure is designed with two distinct environments (`prod` & `preview`).

## Table of Contents
- [Technology Stack](#technology-stack)
- [Build Promotion Strategy](#build-promotion-strategy)
- [Database Architecture](#database-architecture)
- [Security Model](#security-model)

## Technology Stack

- **Runtime**: Cloudflare Workers with Node.js compatibility
- **Framework**: SvelteKit with Cloudflare adapter
- **Database**: Cloudflare D1 (SQLite-based)
- **ORM**: Drizzle
- **Build Tool**: Vite
- **Local Runtime**: Bun
- **Version Management**: Changesets
- **CI/CD**: GitHub Actions

## Build Promotion Strategy

### Core Principle
Instead of building separately for each environment, we build once for preview and promote the same artifacts to production with different runtime configuration.

### Benefits
- **Faster Deployments**: Production deploys in ~30s vs ~3min
- **Identical Artifacts**: What you test is what you deploy
- **Reduced Risk**: No build-time differences between environments
- **Cost Efficiency**: Less compute time and resources

### Dynamic Runtime Variables

All environment-specific configuration is read at **runtime** from Cloudflare's `platform.env`, not baked into the build.

#### Old Style (Static - Build Time)
```javascript
// ❌ Baked into build artifacts
import { PUBLIC_API_URL } from '$env/static/public';
```

#### New Style (Dynamic - Runtime)
```javascript
// ✅ Read at runtime from platform.env
export const GET = async ({ platform }) => {
  const apiUrl = platform?.env?.PUBLIC_API_URL;
};
```

## Database Architecture

### Schema Management
- **ORM**: Drizzle for type-safe database operations
- **Migrations**: Version-controlled schema changes
- **Environment Isolation**: Separate databases per environment

### Database Environments

| Environment | Database | Purpose |
|-------------|----------|---------|
| **Local** | Local D1 via Wrangler | Development and testing |
| **Preview** | `hype-db-preview` | Integration testing and staging |
| **Production** | `hype-db-prod` | Live application data |

## Security Model

### Secret Management
1. **Never in Git**: Secrets never committed to repository
2. **Environment Isolation**: Separate secrets per environment
3. **Least Privilege**: Secrets only accessible to authorized workflows
4. **Rotation Ready**: Easy to update via `wrangler secret put`

### Access Control
1. **Branch Protection**: Enforced workflow prevents bypassing
2. **Environment Gates**: GitHub environments control deployment access
3. **Audit Trail**: All changes tracked through Git and GitHub Actions

### Build Security
1. **Immutable Artifacts**: Same build promoted across environments
2. **Verified Builds**: Only tested builds reach production
3. **Dependency Pinning**: Locked dependency versions via `bun.lockb`

This architecture ensures a secure, efficient, and reliable deployment pipeline that scales with the team and maintains high confidence in production deployments.

