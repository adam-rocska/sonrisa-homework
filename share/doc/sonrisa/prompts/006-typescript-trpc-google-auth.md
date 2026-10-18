# Prompt 006 — server API and authentication choices

Date: 2026-10-18. Tool: Codex desktop.

```text
Jó, félreértettél. Backend alatt szerver oldali backendre gondoltam. A browser plugin majd APIn keresztül beszélget ezzel a backenddel. gRPC vagy tRPC, rád bízom. Mindegy nekem. Bár lehet a tRPC előnyösebb, mert akkor a szerót is felüthetjük ts-ben és tök lightweight lesz az egész. Dunno, your choice. gRPC fan vagyok de nem akarom behozni a fanboyságot :)

Az autentikációra egy sima Google OAuth elég. Örülnék, ha az AuthJS utódját használnád erre, mert akkor cserélgethetjük az autentikációs eljárásokat. Backend same shit, csak a szerver oldali párja.

*— Így el is dőlt: a szerver is typescript lesz... pfehj*

A többire szerintem van jó product koncepcióm és működési elvem.

Akkor így oké, kezdhetem a specifikációt?
```
