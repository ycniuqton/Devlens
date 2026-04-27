---
name: newv
description: Create a new version for an existing feature under /docs/features/, following versioning and line-limit rules
---

The user wants to add a new version to an existing feature's documentation.

## Steps

1. **Identify the feature.** Use the feature name from the prompt. If not provided, list all folders under `/docs/features/` and ask the user to pick one.

2. **Run the pre-write checklist** (from `.devlens/rules.md`):
   - Confirm feature folder exists under `/docs/features/`
   - List all version folders, find the highest numeric one — that is the active version
   - Count total versions

3. **Determine the new version folder name:**
   - If total versions < 5: use next increment (e.g. active is `00002` → new is `00003`)
   - If total versions == 5: the next change MUST be a `reset`. Create `10000-reset` as a fully self-contained new baseline. Inform the user this is a reset version.

4. **Ask the user** what changed in this version (if not already described in the prompt).

5. **Write the new version folder** with only the changed content:
   - `01-requirements.md` — only what changed + explicit statement of what remains unchanged. Max 100 lines.
   - `02-design.md` — only design changes. No line limit.
   - `03-plan.md` — updated execution steps for this version. Max 100 lines.
   - For a reset version, all 3 files must be fully self-contained.

6. **Report** the new version folder name and confirm the active version.

## Constraints
- Follow all Feature & System Documentation rules from `.devlens/rules.md`
- Never create more than 3 files per version folder
- Never skip version numbers unless user explicitly instructs
- If any pre-write check fails, stop and ask the user
