# Workspace preparation — 2026-10-18

## Scope and decisions

The owner already has a plan. This increment only reads the assignment,
creates a local workspace and initializes a private GitHub repository.
No product design, technology selection or implementation was performed.

- Local root: `~/var/homework/sonrisa`.
- Remote: https://github.com/adam-rocska/sonrisa-homework
- One repository covers the root and future subprojects under `src/`.
- FHS roles are applied to a project prefix, recursively. This is a
  project convention, not a claim of operating-system FHS compliance.
- `share/doc/sonrisa/` retains sources and process evidence; runtime
  caches, logs, state and temporary files are ignored recursively.
- No speculative subprojects were created before receiving the plan.
- Original email context and attachment are retained. No email was
  sent, and no collaborators were invited during preparation.

## Source checks

Gmail search for `sonrisa` returned the task email dated 2026-10-16.
The full task thread and its DOCX attachment were read. The connector
reported a complete two-page extraction (`content_truncated: false`).
The original DOCX was downloaded and its ZIP integrity check passed.
Its `word/document.xml` paragraphs were independently read locally;
they agree with the extracted requirements.

Attachment size: 10,478 bytes.
SHA-256:

```text
19183d43253a54c8cb04567f483a4c403745c02b08f51be5a63df6030531f3f5
```

The 48-hour email deadline and suggested 24-hour work budget were
recorded separately, rather than conflated.

## Tool correction

The first system `git` call failed because the selected Xcode installation
requires license acceptance. The installed Command Line Tools Git works.
Subsequent Git and GitHub CLI commands use the process-local setting
`DEVELOPER_DIR=/Library/Developer/CommandLineTools`.
No license acceptance or global developer-directory change was performed.

## Validation boundary

Only source integrity and workspace/repository setup are in scope.
There is no application yet, so no application tests were run.
Remote visibility, commit synchronization, clean status and recursive
ignore behavior are checked after pushing the preparation commits.
