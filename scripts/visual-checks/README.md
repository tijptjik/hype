# Manual visual checks

These scripts and harnesses were preserved from `output/playwright/`. Run them
from the repository root. They are historical manual checks, not a portable or
automatically executed test suite: inspect their local URLs, browser paths and
fixture dependencies before reuse.

Scripts may require a running development server or a temporary fixture. The
rendering scripts can write to development asset storage using environment
credentials; inspect their target before running them. No script was run as part
of this relocation.

Keep authored scripts and harnesses here. Write generated screenshots and logs to
the ignored `output/playwright/` directory, creating that directory as needed.
Durable design references and review boards belong in `docs/design/`.
