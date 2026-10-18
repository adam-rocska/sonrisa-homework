# Prompt 004 — product scope and reviewer strategy

Date: 2026-10-18. Tool: Codex desktop.
User text preserved; trailing HTML whitespace normalized.

```text
Jó. Most elővettem ügyvezetői sapkámat + tapasztal consultant bs bingo ninja expertgatyám.



*"We want users to be able to set up alerts so they get notified when something important happens in the world — like breaking news, market movements, natural disasters, that kind of thing. Should work for both email and Slack. Make it flexible enough that we can add more channels later. We need an admin view too."*



Ez az ami a hipotetikus megrendelői ív. Ez babám fogható úgy is, hogy tök elég:

1. Tessék, itt a google alerts, iratkozz fel amire akarsz
2. Itt egy browser plugin, megnyomod a gombot és szinkronizálod a feedeket (hogy valamennyire azért kulturált legyen a ux)
3. Itt a link a rendszer saját GUIjához; ami meg listázza az összes RSS feedet amire fel van iratkozva, meg beállíthatja, hogy mi hova menjen (slack, mail, etc) + esetleg polling periodot állíthat



Elég jugaad, de technikailag gets the job done. 



Egy valós szituációban ez tök elég pár dologra:

1. Van miről beszélni & demózni
2. Van mit "számlázni", mert teljesült a szöveg, fuck off
3. Van mit továbbdolgozni



Upsell lehetőségből annyi, mint égen a csillag, mert az, hogy RSS legyen az ingestion csak egy detail, lehet más is. Az, hogy az RSS forrás a Google Alerts csak egy detail, lehet más is. Pub-sub adaptereket hozzádobni a Slack & Email halmazhoz simán lehet, szintén csak egy detail. Manapság meg, legalábbis nyugaton/US nagyon ooh shiny shiny a browser extension, szóval még egy cool faktor is lehet (▀̿Ĺ̯▀̿ ̿) 



Mit gondolsz?



A végcél az, hogy a feladat jó legyen, meg elégedett legyen nyilván a reviewer. Az, hogy bs bingo-t várunk el, vagy rendes architect munkát, azt nem tudom; de legjobb tudásommal azt tudom mondani, hogy minél kevesebb a source code liability, annál jobb. Minél több upsell lehetőség van, annál hegyesebb a cerka. Minél minimálabban unlockolhatunk számlázást, annál jobb. Long game úgyis szimpátián megy sajna.



A B terv persze, hogy előveszem a nagy multilayered monster tervemet, de annyira hónaljszagú volna itt villogni egy overengineered ganéval, hogy bilegek vele.



Ismered a problémát, a dilemmámat, az ötleteimet. 



Kutass, és mondd mit gondolsz hogy látod. Aztán döntünk és implementálunk.
```
