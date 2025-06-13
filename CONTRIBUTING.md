# Contribution

## Table of Contents
- [Setup](#setup)
- [Development Flow](#development-flow)
  - [Branching](#branching)
  - [Advanced](#advanced)
- [Environment Variables](#environment-variables)
- [Code Style](#code-style)
- [Git Conventions](#git-conventions)
  - [Branch Naming](#branch-naming)
  - [Merge Rules](#merge-rules)
  - [Commit Messages](#commit-messages)
- [Changesets](#changesets)

## Setup

First install dependencies with `bun install`.

## Development Flow

1. **Feature Development** [`Dev`]: Work on `feat/*` branches with local development
2. **Add Changesets** [`Dev`]: Document significant changes with `bun run cs:add`
3. **Open a PR**: Open a PR to `preview` branch
4. **PR Validation** [`CI`]: Build + Test (no deployment)
5. **Integration Testing** [`CI`]: Merge to `preview` → Build + Test + Deploy to staging
6. **Build Promotion** [`CI`]: Merge `preview` to `main` → Promote cached build to production
7. **Version Management** [`Maintainer`]: Run `bun run cs:version` to prepare releases

This setup uses **build promotion** - the same tested artifacts from preview are promoted to production without rebuilding, ensuring consistency and faster deployments. For detailed information about the CI/CD pipeline, branch protection, and deployment workflows, see [docs/Deployment.md](../docs/Deployment.md).


### Branching

1. Create a feature branch from `preview`:
   ```bash
   git checkout preview
   git pull --rebase
   git checkout -b feat/your-feature
   ```

2. Make your changes and commit:
   ```bash
   git add .
   git commit -m "feat: your feature"
   ```

3. Keep your branch up to date:
   ```bash
   git fetch origin
   git rebase origin/preview
   ```

4. Push your changes:
   ```bash
   git push origin feat/your-feature
   ```

5. Create a PR against `preview`

6. After approval and tests pass, the PR will be automatically rebased and merged.

**Branch Protection Rules:**
- **Main**: Requires successful "DEPLOY :: Preview" status check (enforced for admins)
- **Preview**: Requires successful "BUILD :: Build Application" and "TEST :: Run Tests" status checks (enforced for admins)
- **Rebase Strategy**: All merges use rebase to maintain linear Git history
- **No Force Push**: Force pushes are disabled on protected branches

Note: Direct pushes to `main` are not allowed. All changes must go through PRs. Direct commits to `preview` are allowed for maintainers.


### Advanced

#### Expose Local

**Mullvad** : Note that some commands are sensitive to Mullvad VPN being installed. As it uses split tunneling to ignore the VPN routing for the development commands, whereas the regular internet connectivity can be routed through the VPN.

Hong Kong is excluded from many AI services, hence VPNs are essential to the setup.

Set `NGROK_AUTHTOKEN` and `NGROK_DOMAIN` environment variables, and make sure ngrok is available with `docker pull ngrok/ngrok`, then run

```sh
mullvad-exclude docker run --net=host -it -e NGROK_AUTHTOKEN=$NGROK_AUTHTOKEN ngrok/ngrok:latest http --domain=$NGROK_DOMAIN 5173
```

Then in another shell run

```bash
bun run dev

# or start the server and open the app in a new browser tab
bun run dev -- --open
```

## Environment Variables

This project uses **dynamic runtime environment variables** to enable build promotion. For detailed information about environment variable configuration, usage patterns, and deployment strategies, see [docs/Deployment.md](../docs/Deployment.md).

## Code Style

- Format with [Prettier](https://prettier.io/)

## Git Conventions

- Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/#summary).
- Use [Commitlint](https://commitlint.js.org/). See `commitlint.config.js` for the rules.
- Use [Commitizen](https://commitizen-tools.github.io/commitizen/). Run `bun run commit` for an interactive commit message. Or integrate it into your editor (e.g. [VS Code](https://marketplace.visualstudio.com/items?itemName=KnisterPeter.vscode-commitizen))

### Branch Naming

```
feat/lasar-show
^--^ ^--------^
|          |
|          +---> topic
|
+-------> Type: feat, chore, docs, fix, refactor, perf, style, or test.
```

Branch names must follow one of these patterns:

- `main` - The main production branch
- `preview` - The preview/staging branch  
- `hotfix` - Emergency fixes branch
- `{type}/{topic}` - Feature/development branches

Where `{type}` must be one of the following commit types:

- **chore** - Configuration files, scripts or external dependencies
- **docs** - Documentation only changes
- **feat** - A new feature
- **fix** - A bug fix
- **perf** - Performance improvements
- **refactor** - Code changes that neither fix bugs nor add features
- **style** - Code formatting changes
- **test** - Adding or correcting tests

Examples of valid branch names:
- `feat/user-authentication`
- `fix/login-bug`
- `docs/api-documentation`
- `chore/update-dependencies`

You can test your branch name with: `bun run lint:branch`

### Merge Rules

- **Main Branch**: Only accepts merges from `preview` or `hotfix` branches
- **Preview Branch**: Only accepts merges from feature branches (direct commits allowed for maintainers)
- **Direct Pushes**: Not permitted to `main` or `preview` (except maintainers on `preview`)
- **Branch Protection**: Enforced via GitHub settings with required status checks
- **Build Promotion**: Production deployments reuse preview build artifacts for consistency

### Commit Messages

```
feat: add hat wobble

^--^ ^------------^
| |
| +-> Summary in present tense.
|
+-------> Type: chore, docs, feat, fix, refactor, perf, style, or test.
```

Each commit message consists of a **header**, a **body** and a **footer**. The header has a special format that includes a **type** and a **subject**:

```
<type>: <subject>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

The **header** is mandatory.

Any line of the commit message cannot be longer 100 characters! This allows the message to be easier to read on GitHub as well as in various git tools.

The footer should contain a [closing reference to an issue](https://help.github.com/articles/closing-issues-via-commit-messages/) if any.

#### Revert

If the commit reverts a previous commit, it should begin with `revert: `, followed by the header of the reverted commit. In the body it should say: `This reverts commit <hash>.`, where the hash is the SHA of the commit being reverted.

#### Type

Must be one of the following:

- **chore**: Changes that affect the configuration files, scripts or external dependencies.
- **docs**: Documentation only changes
- **feat**: A new feature
- **fix**: A bug fix
- **perf**: A code change that improves performance
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
- **test**: Adding missing tests or correcting existing tests

#### Subject
The subject contains a succinct description of the change:

* use the imperative, present tense: "change" not "changed" nor "changes"
* don't capitalize the first letter
* no dot (.) at the end

#### Body
Just as in the **subject**, use the imperative, present tense: "change" not "changed" nor "changes".
The body should include the motivation for the change and contrast this with previous behavior.

#### Footer
The footer is the place to reference GitHub issues that this commit **Closes**.

## Changesets

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

```
# Version packages (bumps versions, updates CHANGELOG)
bun run cs:version
```

Releases are run as part of a merge to main on the GitHub action.

**Recommended Release Workflow:**

1. **Development**: Add changesets when making significant changes
2. **Pre-release**: Run `bun run cs:version` to bump versions and update changelogs
3. **Release**: Merge to `preview` for staging validation, then `main` for production