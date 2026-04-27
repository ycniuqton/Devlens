---
name: newf
description: Create a new feature documentation folder under /docs/features/ with the initial version
---

The user wants to start documentation for a new feature.

## Steps

1. **Identify the feature name.** Use the name from the prompt. If not provided, ask the user for:
   - Feature name (used as the folder name, kebab-case)
   - Brief description of the feature's business intent

2. **Confirm** `/docs/features/<feature-name>/` does not already exist. If it does, stop and tell the user to use `/newv` instead.

3. **Create the initial version folder:** `/docs/features/<feature-name>/00000-init/`

4. **Write the 3 required files** based on the feature description from the prompt:
   - `01-requirements.md` — business intent, functional requirements, constraints. Max 100 lines.
   - `02-design.md` — initial design, architecture, flows. No line limit.
   - `03-plan.md` — initial execution steps / checklist. Max 100 lines.
   - If the user has not provided enough detail, write minimal stubs and note what needs to be filled in.

5. **Report** the created path and confirm the active version is `00000-init`.

## Constraints
- Follow all Feature & System Documentation rules from `.devlens/rules.md`
- Folder name must be kebab-case, derived from business intent (not implementation)
- Never create more than 3 files in the version folder
- Requirements and plan must stay ≤ 100 lines
