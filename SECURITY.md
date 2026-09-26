# Security

JLFBot is a single-owner personal project.

- Report a problem privately through GitHub's private vulnerability reporting
  on <https://github.com/jaylfronteras/JLFBot/security/advisories/new> (if
  enabled), not a public issue.
- Never commit credentials. Local secrets belong in `.env` (git-ignored) or in
  the app's own credential store under the data directory (`~/.jlfbot`).
- If a secret is ever committed, rotate it first, then remove it from history.
