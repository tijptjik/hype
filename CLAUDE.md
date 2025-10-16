# CLAUDE.md

## Project Overview

HYPE is a SvelteKit web application for "Mapping public infrastructure and cultural artifacts in Hong Kong". It's deployed on Cloudflare Workers with D1 database.

## Essential Commands

### Development

```bash
bun run dev              # Start development server
bun run lint             # Run ESLint and Prettier checks
bun run format           # Auto-format code
```

Do NOT run the server, as you cannot meaningfully test the API without auth.

### Testing

```bash
bun run test             # Run tests in watch mode
bun run test:run         # Run tests once
bun run test:ui          # Run tests with UI
```

### Build

```bash
bun run build            # Build local app
```

Deployments are handled by Github Actions.

### Database Operations

Schema migrations are handled with:

```bash
# Migrations
bun run db:migration:new <description>           # Generate new migration
bun run db:migration:run:local                   # Apply to local DB
```

## Architecture Overview

### Technology Stack

- **Frontend**: SvelteKit with Svelte 5 (runes-only mode)
- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite) with Drizzle ORM
- **Build**: Vite with Cloudflare adapter
- **Package Manager**: Bun
- **Maps**: MapLibre GL
- **Auth**: Better Auth

### Project Structure

```
src/
├── lib/
│   ├── api/          # API services
│   ├── auth/         # Authentication
│   ├── components/   # Svelte components
│   ├── db/           # Database schema & operations
│   ├── map/          # Map utilities
│   └── paraglide/    # Auto-generated i18n
├── routes/           # SvelteKit file-based routing
└── tests/            # Test files
```

### Database Schema Hierarchy

- **Organisations** → **Projects** → **Layers** → **Features**

### Key Development Patterns

#### Svelte 5 Runes (MUST USE)

```javascript
// State
let count = $state(0);

// Derived values
let doubled = $derived(count * 2);

// Effects
$effect(() => {
  console.log('Count changed:', count);
});

// Props
let { prop = defaultValue } = $props();

// Bindable props
let { value = $bindable() } = $props();
```

#### Database Queries

Use the services '$lib/db/services/{resource}

#### TypeScript Patterns

- Use type guards and predicates for runtime checking
- Implement discriminated unions for complex state
- Provide explicit return types
- Use utility types (Partial, Readonly, Pick)
- Use `as const` for enum-like constants

### Internationalization

- Paraglide JS for i18n
- Messages in `messages/` directory
- Runtime translation via Azure Translation API
- Use `m.message_key()` for translations

### Code Quality

- ESLint + Prettier for formatting
- TypeScript strict mode
- Husky git hooks
- Conventional commits with Commitizen
- Changesets for versioning
