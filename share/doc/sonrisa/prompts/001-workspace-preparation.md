# Prompt 001 — workspace preparation

Date: 2026-10-18. Tool: Codex desktop.
User task text below; trailing HTML whitespace is normalized.
This archive begins with this preparation session. It does not claim to
contain earlier conversations or hidden tool/system instructions.

```text
Na, ideje, hogy foglalkozzunk a Sonrisa feladattal. Első feladatod: olvasd el a gmailemből, hogy mi a feladat. van e-mail van csatolmány.

Ne gondoljad túl, mert nekem már van tervem. Te először ismerjed meg és hozdd ltére a workspace-t. 

Workspace menjen lokálba, `~/var/homework/sonrisa` legyen a célmappa. Szá,molj azzal, hogy több alprojektből fog állni. FHS (filesystem hierarchy standard) szerint menjen a szervezés, rekurzívan. Ebbe a mappába kell egy src és abba mennek majd még az alrpojektek, szintén FHS szerint.

Szabad kezed van a sonrisa-s mappán és az alatt mindenen.

Ami felkészülés még kell, hogy a főmappának kell egy github repó. Csinálj egyet, mindegy mi, csak privát legyen. És a főmappát verziózzad. Béna, mint a szar, de ez most ilyen lesz. Requirement része.

Más egyelőre nincs. 

Munkára.
```

## User-supplied commit instructions

```md
# Global instructions to apply contextually

## Git commits

### Messages

Every Git commit must be as follows:

    ${emoji} ${summary}
    $details}

where:

- `emoji` is the emoji best summarizing the commit contents
- `summary` is a short summary of the commit
- `details` are optional and must be written in markdown syntax
- every line is at most 60 characters long

### Frequency

I want many atomic small commits. Every small increment must
go in a commit. It is acceptable if a consecutive commit
undoes the previous one(s). The important bit is to have a
clear chronological worklog based on commit messages.
```
