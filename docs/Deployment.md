# Deployment

## Table of Contents

- [Overview](#overview)
- [Build Promotion Strategy](#build-promotion-strategy)
- [Environment Variables](#environment-variables)
  - [Dynamic Runtime Variables](#dynamic-runtime-variables)
  - [Configuration Strategy](#configuration-strategy)
  - [Variable Types](#variable-types)
  - [Mode Selection](#mode-selection)
- [Branch Strategy](#branch-strategy)
- [CI/CD Pipeline](#cicd-pipeline)
  - [Workflow Overview](#workflow-overview)
  - [Branch Protection](#branch-protection)
  - [Caching Strategy](#caching-strategy)
- [Deployment Environments](#deployment-environments)
- [Security Model](#security-model)

## Overview

This application uses a **build promotion architecture** designed for:

- **Consistency**: Same build artifacts across environments
- **Speed**: No rebuilding for production deployments
- **Reliability**: Tested builds promoted to production
- **Efficiency**: Optimized CI/CD with intelligent caching

## Build Promotion Strategy

### Core Principle

Instead of building separately for each environment, we build once for preview and promote the same artifacts to production with different runtime configuration.

### Benefits

- **Faster Deployments**: Production deploys in ~30s vs ~3min
- **Identical Artifacts**: What you test is what you deploy
- **Reduced Risk**: No build-time differences between environments
- **Cost Efficiency**: Less compute time and resources

## Environment Variables

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

### Configuration Strategy

| Variable Type      | Storage            | Access Method           | Environment         |
| ------------------ | ------------------ | ----------------------- | ------------------- |
| **Public**         | `wrangler.toml`    | `platform.env.PUBLIC_*` | All                 |
| **Worker Secrets** | Cloudflare Secrets | `platform.env.*`        | Preview, Production |
| **Local Secrets**  | `.dev.vars`        | `platform.env.*`        | Local only          |

### Variable Types

#### **Public Variables** (Non-sensitive)

Stored in `wrangler.toml` and accessible in both server and client contexts:

```toml
[vars]
PUBLIC_CLOUDINARY_CLOUD_NAME="dg6vtsga1"
PUBLIC_SVELTE_QUERY_DEVTOOLS=false

[env.preview.vars]
PUBLIC_SVELTE_QUERY_DEVTOOLS=true

[env.production.vars]
PUBLIC_SVELTE_QUERY_DEVTOOLS=false
```

**Available Public Variables:**

- `PUBLIC_SVELTE_QUERY_DEVTOOLS` - Enable/disable query devtools
- `PUBLIC_DRIZZLE_LOGGER` - Enable/disable database logging
- `PUBLIC_HUB_CODE` - Hub override for development
- `PUBLIC_CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- `PUBLIC_CLOUDINARY_UPLOAD_PRESET` - Cloudinary upload preset
- `PUBLIC_AZURE_TRANSLATION_REGION` - Azure translation region
- `PUBLIC_GIPHY_KEY` - Giphy API key

#### **Secret Variables** (Sensitive)

Uploaded to Cloudflare via `wrangler secret put`:

```bash
# Upload to preview
wrangler secret put AUTH_SECRET --env preview

# Upload to production
wrangler secret put AUTH_SECRET --env production
```

**Available Secret Variables:**

- `AUTH_SECRET` - Authentication secret
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` - Google OAuth credentials
- `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` - Cloudinary API credentials
- `AZURE_TRANSLATION_KEY` - Azure translation API key
- `SUPERADMIN_USERID` - Super admin user ID

#### **Local Development**

Uses `.dev.vars` for secrets and `wrangler.toml` for public vars:

```bash
# .dev.vars (gitignored)
AUTH_SECRET=local-dev-secret
CLOUDINARY_API_KEY=local-dev-key
```

#### **Configuration Files**

```
wrangler.toml                # PUBLIC vars for all environments
.dev.vars                    # SECRET vars for local development only
.dev.vars.preview            # SECRET reference for preview (upload manually)
.dev.vars.production         # SECRET reference for production (upload manually)
```

**Key Principles:**

- **Public vars**: Defined in `wrangler.toml`, read at runtime via `platform.env`
- **Secret vars**: Uploaded to Cloudflare via `wrangler secret put`, accessed via `platform.env`
- **No static imports**: All environment access is dynamic for build promotion compatibility

### Mode Selection

Environment selection is handled automatically:

- **Local**: Uses `wrangler.toml` vars section and `.dev.vars`
- **Preview**: Uses `wrangler.toml` env.preview.vars and Cloudflare secrets
- **Production**: Uses `wrangler.toml` env.production.vars and Cloudflare secrets

## Branch Strategy

```
feature/* → preview → main
    ↓         ↓       ↓
   dev    staging   prod
```

- **Feature branches**: Development and testing
- **Preview branch**: Integration testing and staging deployment
- **Main branch**: Production deployment (promotes preview builds)

### Branch Protection Rules

- **Main**: Requires successful "DEPLOY :: Preview" status check (enforced for admins)
- **Preview**: Requires successful "BUILD :: Build Application" and "TEST :: Run Tests" status checks (enforced for admins)
- **Rebase Strategy**: All merges use rebase to maintain linear Git history
- **No Force Push**: Force pushes are disabled on protected branches

## CI/CD Pipeline

### Workflow Overview

The pipeline follows a strict promotion strategy:

1. **Feature Development**: Work on feature branches
2. **PR Validation**: Build + Test on PR to preview
3. **Preview Deployment**: Build + Test + Deploy to staging
4. **Production Promotion**: Deploy cached build to production

#### **Preview Deployment** (`preview` branch):

1. **Build** → **Test** → **Deploy Preview**
2. Caches build artifacts for later promotion
3. Runs full CI/CD pipeline

#### **Production Deployment** (`main` branch):

1. **Deploy Production** (promotes preview build)
2. Reuses cached build artifacts from preview
3. Applies production environment variables at runtime
4. **No rebuilding** - faster and more reliable

#### **Pull Request Validation**:

1. **Build** → **Test** (no deployment)
2. Validates changes before merge

### Branch Protection

Enforced via `.github/settings.yml`:

#### **Main Branch**

- ✅ Requires successful preview deployment
- ✅ No direct pushes allowed
- ✅ No force pushes
- ✅ PR required from preview branch only

#### **Preview Branch**

- ✅ Requires build + test success
- ✅ No direct pushes allowed (except maintainers)
- ✅ PR required from feature branches

### Caching Strategy

#### **Dependencies Cache**

```yaml
path: node_modules
key: ${{ runner.os }}-deps-${{ hashFiles('**/bun.lockb') }}
```

#### **Build Artifacts Cache**

```yaml
path: .svelte-kit
key: ${{ runner.os }}-build-${{ github.sha }}
```

#### **Test Results Cache**

```yaml
path: test-results
key: ${{ runner.os }}-test-${{ github.sha }}
```

## Deployment Environments

### Local Development

- **Database**: Local D1 via Wrangler
- **Secrets**: `.dev.vars` file
- **Public Vars**: `wrangler.toml` vars section
- **Domain**: `localhost:5173`

### Preview Environment

- **Worker**: `hype-preview`
- **Database**: `hype-db-preview`
- **Domain**: `preview.hype.hk`
- **Purpose**: Integration testing and stakeholder review

### Production Environment

- **Worker**: `hype-prod`
- **Database**: `hype-db-prod`
- **Domain**: `hype.hk`
- **Purpose**: Live application

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

This deployment strategy ensures a secure, efficient, and reliable pipeline that scales with the team and maintains high confidence in production deployments.
