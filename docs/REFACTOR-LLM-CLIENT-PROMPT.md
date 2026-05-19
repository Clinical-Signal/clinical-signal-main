# Handoff prompt for Claude Code — LLM client centralization refactor

Paste everything below the line into a fresh Claude Code session opened in `~/clinical-signal-main`.

---

## Task: Centralize the TypeScript LLM client and externalize prompts

I want to refactor the TypeScript side of this codebase to mirror the convention already used on the Python side: every Anthropic SDK call goes through a single client file, and every system prompt lives in a versioned `.md` file rather than as an inline TypeScript constant. The goal is **hire-ability** — a contractor or new dev should be able to read one file to understand all AI usage in the app.

This is **not** a multi-provider abstraction. We're not adding OpenAI, LiteLLM, or any router. Stay with `@anthropic-ai/sdk`. The point is structural cleanliness and discoverability, not provider portability.

### Read first

Before writing code, read these so you have full context:
- `CLAUDE.md` — project overview, security model, build order
- `ARCHITECTURE.md` — system design
- `docs/MVP-PRIORITIZATION-2026-05-08.md` — what we're shipping toward

### Current state to refactor away from

The TypeScript side has inline `*_PROMPT` constants and direct `@anthropic-ai/sdk` imports scattered across these five files:

- `apps/web/lib/analysis.ts`
- `apps/web/lib/protocol-outputs.ts`
- `apps/web/lib/clinical-dialogue.ts`
- `apps/web/lib/pattern-recognition.ts`
- `apps/web/lib/safety-validation.ts`

The Python side (which we're mirroring) externalizes prompts at `services/analysis-engine/prompts/*.md` and centralizes SDK calls in `services/analysis-engine/app/pipeline/llm.py`. Skim those before designing the TypeScript equivalent.

### Desired end state

1. **New file: `apps/web/lib/llm.ts`** — the only file in the entire `apps/web/` tree that imports `@anthropic-ai/sdk`. Exposes a small typed surface:
   - A `callModel({ system, messages, ...opts })` function (or a few specialized functions if a single one becomes awkward — your call)
   - Streaming variant for protocol generation, which currently streams and uses `salvageJson()` — preserve that exact behavior
   - Reads `ANTHROPIC_API_KEY` and any model defaults from env, in one place

2. **New directory: `apps/web/lib/prompts/`** — every prompt currently inline in the five lib files becomes a `.md` file here, named with the `_vN` suffix convention from the Python side. Keep the prompt content byte-for-byte identical — this is a relocation, not a rewrite. Recent commit `8634f57` added prompt versioning telemetry; preserve whatever version-tagging the code does today.

3. **Refactored lib files** — the five files above import their prompts from `lib/prompts/` and call into `lib/llm.ts`. They should no longer reference `@anthropic-ai/sdk` directly.

### Loading the .md prompts

Recommended approach: read the `.md` files at runtime via `fs.readFileSync` from a `loadPrompt(name: string)` helper in `lib/llm.ts`. All five caller files are server-only, so `fs` is fine. Cache reads in-process. This matches the Python convention exactly and keeps prompts editable as plain text.

If the Next.js bundler chokes on the `fs` reads (it might not — these are server-side lib files), fall back to inlined imports using whatever the project's bundler convention is, but verify before making that call.

### Hard constraints

- **No behavior change.** Same model calls, same params, same outputs. Run a protocol generation end-to-end before and after to verify.
- **Preserve streaming** for protocol generation — current code streams and uses `salvageJson()` for partial-output handling. Don't lose that.
- **Preserve prompt-versioning telemetry** added in commit `8634f57` — whatever the current code stores in protocol metadata about which prompt version generated it must continue to work.
- **Preserve source attribution + safety checklists** that are currently in the prompts. Just relocate the content; don't edit it.
- **Keep TypeScript strict-mode happy.** No `any` in the new client surface.
- **One commit per logical step on a branch named `refactor/centralize-llm-client`.** Do not push to main.

### Out of scope

- Don't refactor the Python side. It's already structured the way we want.
- Don't add a provider abstraction layer or feature-flag system.
- Don't change prompt wording.
- Don't touch the intake-feedback issues (#165–171). Those are separate work.
- Don't make the change to also fix `T3.x` security items from the prioritization doc — separate PR.

### Verification before you call it done

```bash
cd apps/web
npx tsc --noEmit                 # must pass
npm run lint                     # must pass (project may have no eslint config; that's fine)
npm run build                    # must succeed
npm run test                     # if tests exist for the affected files (lib/__tests__/)
```

Plus a manual smoke test against the dev environment:
```bash
docker compose up -d
# Walk through: login → create patient → fill intake → generate protocol → approve → see derivative outputs
```

Verify the protocol generated after the refactor matches the structure/quality of one generated before — same prompts, same model, should be functionally identical.

### Suggested commit sequence

1. Create `apps/web/lib/llm.ts` with the client wrapper, no callers yet.
2. Create `apps/web/lib/prompts/` and move the prompts from one of the five files (start with `safety-validation.ts` — smallest surface). Refactor that file to use the new client + prompt loader. Verify build + smoke test.
3. Repeat for `pattern-recognition.ts`, `clinical-dialogue.ts`, `protocol-outputs.ts`, `analysis.ts` in that order (smallest to largest).
4. Final commit: verify no `@anthropic-ai/sdk` imports remain outside `lib/llm.ts` (`grep -r "@anthropic-ai/sdk" apps/web/lib | grep -v llm.ts` should return empty).

### When you're done

Open a draft PR against `main` titled "refactor: centralize LLM client and externalize prompts". Don't merge. Tag me for review.
