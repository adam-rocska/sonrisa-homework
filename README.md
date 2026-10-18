# Sonrisa homework

Local workspace: `~/var/homework/sonrisa`.

Status: workspace preparation only. Product planning and implementation
await the owner's plan; no technology or subproject boundaries chosen.

## Layout

The workspace applies the directory roles of FHS 3.0 to a project prefix.
It is not an operating-system root filesystem. The same convention
applies recursively to each future `src/<subproject>/`.

| Path | Purpose |
| --- | --- |
| `src/` | Subprojects; each uses this same layout |
| `bin/`, `sbin/` | Executable tools and administrative tools |
| `etc/` | Configuration and safe configuration examples |
| `include/`, `lib/` | Headers and libraries |
| `share/doc/sonrisa/` | Brief, plans, decisions and process evidence |
| `share/man/` | Manual pages, if needed |
| `var/lib/` | Persistent application state |
| `var/log/` | Runtime logs |
| `var/cache/` | Rebuildable caches |
| `var/tmp/`, `tmp/`, `run/` | Temporary files and runtime state |

Keep reviewed working artifacts, prompt history and validation evidence
under `share/doc/<project>/`, including useful scratch work. Temporary
runtime directories are ignored; they are not the submission archive.
Runtime state and logs are also ignored. Empty directories use `.gitkeep`.

The root repository versions all subprojects together. Do not initialize
nested Git repositories or submodules unless the owner requests it.

Reference: [FHS 3.0](https://refspecs.linuxfoundation.org/FHS_3.0/fhs.html),
especially the local hierarchy, shared data and variable data sections.

## Sources and process

- `share/doc/sonrisa/sources/`: original assignment and email context.
- `share/doc/sonrisa/prompts/`: exact task prompts in chronological order.
- `share/doc/sonrisa/process/`: preparation decisions and checks.

The submission requires the full prompt history and visible evidence of
decisions, rejected outputs, corrections and validation. Record these
throughout subsequent work, alongside small atomic commits.
