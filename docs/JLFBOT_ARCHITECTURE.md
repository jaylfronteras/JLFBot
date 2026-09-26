# JLFBot Personal Fork Architecture

JLFBot is a private, single-owner AI agent workspace derived from the Apache-2.0 core of JLFBot.

## Fork policy

- `main` stays close to upstream for synchronization.
- `jlfbot-dev` contains JLFBot-specific work.
- The separately licensed `enterprise/` directory is intentionally absent.
- Keep `server/enterprise.ts` as the OSS compatibility seam unless a later refactor proves removing it is worthwhile.
- Preserve the permission broker and fail-closed computer-control boundaries.
- Prefer configuration and small extension points over repo-wide string replacements.

## Runtime map

1. `src/` — React chat UI. Sends HTTP commands and consumes the canonical SSE event stream.
2. `server/index.ts` — harness HTTP/SSE API and turn orchestration.
3. `server/contracts.ts` — provider SPI and canonical runtime contracts.
4. `server/drivers/` — Claude, Codex, Grok and other engine adapters.
5. `server/harness/` — provider registry and event fan-in.
6. `electron/` — desktop shell and platform capabilities.
7. MCP — external tools can be mounted into bots; JLFBot also exposes a bounded MCP control plane.
8. Computer/browser — cloud, local/host computer and browser capabilities are mounted according to driver capability flags.
9. Storage — bots, config, transcripts and event logs are local-first.

## Personal-product priorities

1. Preserve full OSS agent functionality.
2. Rebrand through centralized product configuration rather than broad replacements.
3. Keep engine/provider abstractions intact so Claude, Codex, Grok and custom engines remain interchangeable.
4. Keep MCP, browser, computer, permissions, routines, channels, voice and bot-to-bot delegation modular.
5. Prefer private remote access (for example a trusted private network) over exposing the loopback harness.
6. Keep upstream merges easy: avoid unnecessary edits to core runtime files.

## Planned JLFBot customization layers

- Product identity: JLFBot name, icons, package metadata and data-directory migration.
- UI: personal onboarding, sidebar, agent creation and settings.
- Agents: personal defaults, roles and model preferences.
- Tools: MCP and connected-app defaults.
- Computers: preferred local/cloud execution backends.
- Remote use: secure personal access from desktop/mobile.
- Automation: routines and personal background workflows.

## Security invariants

- Do not expose the harness loopback port directly.
- Do not bypass approval/permission checks.
- Do not commit API keys, provider credentials or session tokens.
- Keep host-computer control opt-in and fail closed on unsupported platforms.
- Treat local config/backups as sensitive because some credentials are stored locally.


## Verification policy
- JLFBot-specific changes must pass the repository CI matrix before they are merged into main.
- Keep main as the clean upstream-compatible baseline until the development branch is verified.
