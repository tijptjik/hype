# Contribution

## Code Style

- Format with [Prettier](https://prettier.io/)

## Git Conventions

- Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/#summary).
- Use [Commitlint](https://commitlint.js.org/). See `commitlint.config.js` for the rules.
- Use [Commitizen](https://commitizen-tools.github.io/commitizen/). Run `bun run commit` for an interactive commit message. Or integrate it into your editor (e.g. [VS Code](https://marketplace.visualstudio.com/items?itemName=KnisterPeter.vscode-commitizen))

### Branch Naming Convention

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

- Merges to `main` are only allowed from `preview` or `hotfix` branches
- Direct pushes to `main` are not permitted
- All changes must go through the appropriate branch workflow


### Commit Message Format

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

### Revert

If the commit reverts a previous commit, it should begin with `revert: `, followed by the header of the reverted commit. In the body it should say: `This reverts commit <hash>.`, where the hash is the SHA of the commit being reverted.

### Type

Must be one of the following:

- **chore**: Changes that affect the configuration files, scripts or external dependencies.
- **docs**: Documentation only changes
- **feat**: A new feature
- **fix**: A bug fix
- **perf**: A code change that improves performance
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
- **test**: Adding missing tests or correcting existing tests

### Subject
The subject contains a succinct description of the change:

* use the imperative, present tense: "change" not "changed" nor "changes"
* don't capitalize the first letter
* no dot (.) at the end

### Body
Just as in the **subject**, use the imperative, present tense: "change" not "changed" nor "changes".
The body should include the motivation for the change and contrast this with previous behavior.

### Footer
The footer is the place to reference GitHub issues that this commit **Closes**.

## Verionsing

- Use [Changesets](https://github.com/changesets/changesets) and follow [SemVer](https://semver.org/).
