# Contribution

## Table of Contents
- [Setup](#setup)
- [Development Flow](#development-flow)
  - [Advanced](#advanced)
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
4. **Integration Testing** [`CI`]: `preview` tests the code → deploys to `hype-preview`
5. **Version Management** [`Maintainer`]: Run `bun run cs:version` to prepare releases
5. **Production Release** [`Maintainer`]: Merge `preview` to `main` → deploys to `hype-prod`

This setup ensures isolated environments, automated deployments, and a clear path from development to production.

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

- Merges to `main` are only allowed from `preview` or `hotfix` branches.
- Direct pushes to `main` are not permitted.
- All changes must go through the appropriate branch workflow.

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