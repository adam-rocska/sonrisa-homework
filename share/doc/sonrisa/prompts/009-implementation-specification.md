# Prompt 009 — implementation specification

Date: 2026-10-18. Tool: Codex desktop.
User wording retained; trailing HTML whitespace normalized.

```text
Igen, BetterAuth viszont el kell kerülni a fizetős cuccaikat, mint a lepráskolerás covidot permetező chemtrail 5grepülőt!

Free shit for everything.

Na, akkor. A browser extension buli az legyen Plasmo alapú. Gondolom nem lett jobb cucc az elmúlt fél évben. Ha igen, akkor stopp, besézljünk róla. De ha nem, Plasmo it is. Plasmot konfigoljad keményen. pnpm, szigorú ts, explicit dialektika, ahogy szoktuk.

A szerver oldallal tRPC-n érjenek össze.

Mindkét esetben igaz: Az alkalmazásoknak legyen saját belső adatmodelljük. Az, hogy ők tRPC-n keresztül csacsognak, nem jelenti azt, hogy ugyanaz a modell az SQLite DB-től a UI-ig!

UI legyen React alapú - bár asszem az a default plasmoval. ShadCN vagy bármi sterilebb lightweight ui lib elég hozzá. Legyen accessible, hogy a vaksi szememmel is tudjam kezelni + legyen hotkey vezérelhető az egész. A hotkeyek legyenek intuitívak. Hotkey ügyben vedd figyelembe azt, hogy máshogy gondolkodik a windowsos és a maces, és ideálisan macen kapjam azt amit macesként megszoktam a windowsosok meg amit akarnak.

A működése a pluginnek: ha nem a google alerts oldalon vagyok, akkor vigyen oda: https://www.google.com/alerts

Ha nem vagyok belépve a Google Alertsen akkor a gombot nyomkodva, ha Google Alerts page-en vagyok, vagy bármi Google-ös oldalon, akkor csak egy natív buborékkal jelezze, hogy előbb bekéne jelentkezzek. Ha van ennél jobb ötleted, mondd el.

Ha már bevagyok lépve, akkor a Google Alertsen felvihetek ugyebár egy vagy több értesítés beállítást. A Google saját natív UI-án. Ez nem concernje a pluginünknek.

Ha bevagyok lépve és a Google Alertsen vagyok és megnyomom a plugin extension gombját, akkor történjen egy PUT jellegű sync a szerver felé. Nem update, nem diffelgetünk, PUT. Ami a helyi álapot az megy fel és kész. Az RSS feedeket kis DOM turkálással lehet összekanalazni. Nézz bele a DOMba és találj ki jobbat, ha akarsz. De szerintem `href="/alerts/feeds/123/456"` ezt a mintát követve egy CSS szelektor minden anchorra aminek a hrefje `/alerts/feeds/` -el kezdődik, érdekes. És akkor azoknak a `.delivery_settings_view` classú parentjéből a `.query_div span` szelektor szerintem tök elég arra, hogy a kifejezést is kiemeljed. Ez a search queryt adja meg.

A manuális sync mindenképp kell fallbacknek. Viszont adjunk automata syncet is. Azt pedig sima DOM mutation figyelővel lehet adni + odalbetöltéskor.

Szerintem a fontos részleteket elmondtam a browser pluginről. Ha nem, kérdezz.

Ami a szerver oldalt / **backendet** illeti, az annyira vékony, hogy sok concern nincs. Ami fontos, hogy:

- SQLite legyen, azért, mert elsőre good enough, jó kliensek vannak rá + az AI is jól tud vele dolgozni.
- tRPC modell egy kacsa, az SQLite adatmodell egy másik kacsa, és az, hogy az alkalmazás belső állapota mivel dolgozik memóriában, egy másik. Három adatmodellréteget akarok, ezek ne kavarodjanak össze. Azért legyen így, mert ezzel megnöveljük a mozgásteret front- middle- back-ware szinten
- A szerver fő dolga pubsub: figyeli az RSS feedeket, és ha van valami, akkor szól. Nagy a kísértés, hogy hozzak be egy queue-t de valójában nem tartom indokoltnak még. Az RSS állapotából és abból, hogy mit küldtünk már ki, összelehet diffelni azt, hogy összeszarta-e magát a program és ha igen, próbálja újra. Legyen nearrealtime.
- Az értesítésküldési rétegre legyen egy külön absztrakció. Tervezz hozzá egy puha interfészt és annak legyen két implementációja: Slack és E-Mail. Az e-mail delivery metodósua legyen a sima oprendszer által provideolt eljárás, nothing fancy. Most egy twillio vagy hasonló overkill lenne. Főleg mert nem költök pénzt a házira. Viszont érdemes megjegyezni az átadási doksiba, hogy a Twillio integráció volna javasolt egy ilyen hipotetikus termékre azért, mert könnyen és olcsón bővíthető SMS és más értesítési szolgáltatásokra is.
- Legyen ripityára tesztelve. SOLID unitokat akarok. DRY-t alkalmazz, lehetőleg FIRST szerint dolgozz és akkor így a unit teszteken nem is kell ugrálni. Az integrációs, és system tesztek csábítanak de egy ekkora scopera overkill lenne. Viszont akarok black box szadista teszteket. Random leáll a szerver, túlterhelt a szerver, frissül futásidő közben egy függősége, ilyenek. Nem tudom eldönteni viszont, hogy erre a scopera ez is overkill vagy sem, ezért a szadista teszteket amiket szoktunk a te döntésedre bízom.

Ha van eldöntenivaló vagy tisztázandó menet közben kérdezz ahogy szoktál.

Tudtommal leírtam mindent ami nekem most fontos, és amit nyitva hagytam, best effort szinten legalábbis, de szándékosan hagyom nyitva.

Tudom, még kéne terméknév meg package namespace. Whatever, válassz valamit ami szimpi.

FYI: ez a solution nem fog mobilon menni (nyilván). Repülünk vele a radar alatt, nem volt része a specinek. Tudtommal ez kielégíti a manager briefet. Ha extra igény, akkor az is megoldható, de most úgy döntök out of scope nekünk.

Na, kápráztass el minket :)
```
