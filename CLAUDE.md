# CLAUDE.md

## Communication

Responses must be brutally concise. One sentence where possible. No preamble, no summary, no restating what was done. Lead with the result only.

## Development Practices

ALWAYS commit and push directly to `main`. Never create feature branches, never use preview branches. Every push must go to `main` → Vercel production. No exceptions.

Each push = 1 Vercel deployment (100/day limit on free plan). Batch all changes for a task into a SINGLE commit and push. Never push empty commits. Never push multiple times for the same task.

Always use caveman mode with the skill /caveman
