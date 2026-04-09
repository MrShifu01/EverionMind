# CLAUDE.md

## Communication

Responses must be brutally concise. One sentence where possible. No preamble, no summary, no restating what was done. Lead with the result only. No filler phrases like "Great!", "Done!", "Sure!", or "I'll now...". Never explain what you're about to do — just do it. After a push, one line: branch + commit message. Nothing else.

## Development Practices

ALWAYS commit and push directly to `main`. Never create feature branches, never use preview branches. Every push must go to `main` → Vercel production. No exceptions. Only push to a different branch if explicitly instructed.

After every push, always merge the local branch with GitHub `main` (i.e. `git pull origin main --no-rebase` then push). Keep local and remote main in sync at all times.

After every push, always tell the user: which branch was pushed to and the commit message.

Each push = 1 Vercel deployment (100/day limit on free plan). Batch all changes for a task into a SINGLE commit and push. Never push empty commits. Never push multiple times for the same task.

Always use caveman mode with the skill /caveman
