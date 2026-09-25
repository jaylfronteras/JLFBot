# Development notes

JLFBot is maintained for personal use. The essentials:

```sh
corepack enable && pnpm install
pnpm typecheck && pnpm lint && pnpm i18n:check
pnpm exec vitest run            # full suite (slow); pass file paths to narrow it
pnpm build && pnpm build:server
```

- Node 24+ and the pnpm version pinned in `package.json` (`packageManager`).
- CI (`.github/workflows/ci.yml`) runs typecheck, lint, the vitest shards on
  Linux/macOS/Windows, packaged-server and Linux package smokes.
- Locale strings: edit `src/locales/en.json`; `pnpm i18n:check` validates the
  other catalogs.
- See `AGENTS.md` for conventions used by coding agents.
