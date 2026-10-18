# Workspace instructions

These rules apply recursively to the entire repository.

## Scope and layout

- Follow the owner's plan. Preparation does not authorize designing or
  implementing the product before the owner supplies that plan.
- Put subprojects in `src/<name>/`. Apply the FHS directory roles from
  the root README recursively inside each subproject.
- Keep one Git repository rooted here; no nested repositories.
- Store documentation, prompts and durable evidence in
  `share/doc/<project>/`, not ignored runtime directories.
- Keep the original assignment unchanged. Distinguish requirements
  from assumptions, decisions and implementation status.
- Preserve every task prompt and record meaningful checks, rejected
  outputs and corrections as work proceeds. Never commit secrets.

## Git commits

Make many small atomic commits: commit each small increment.
Consecutive commits may undo earlier work when appropriate.

Every commit message starts with an emoji and a short summary:

```text
${emoji} ${summary}

${optional markdown details}
```

Every line must be at most 60 characters long.
