# Bookly — Claude Code instructions

**Bookly** — Angular 22 library management dashboard. Uses **pnpm** (not npm).

Keep this file lean — detailed guidance lives in reference docs:

- **Angular / TypeScript code style** → read `docs/angular-style.md` before writing or reviewing code
- **UI / visual design** (colors, typography, components, layout) → read `DESIGN.md` at repo root
- **Project context & goals** → `CONTEXT.md`
- **Architecture decisions** → `docs/adr/`

Commands: `pnpm start` (dev server), `pnpm test`, `pnpm build`.

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues in `jeffreylai-999/bookly`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary, label string equal to role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
