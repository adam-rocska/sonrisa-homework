import type { en } from './system.en';
import type { Message } from './types';

export const hu = {
  'sync.replacing': 'A teljes Google Alerts-lista szinkronizálása folyamatban…',
  'sync.success': {
    one: '{count} RSS-forrás szinkronizálva.',
    other: '{count} RSS-forrás szinkronizálva.',
  },
  'sync.skipped': {
    one: '{count} csak e-mailes értesítést kihagytunk.',
    other: '{count} csak e-mailes értesítést kihagytunk.',
  },
  'sync.openedNew':
    'Megnyílt a Google Alerts. Jelentkezz be, válaszd az RSS-kézbesítést, majd nyomd meg a Signalpost gombját a szinkronizáláshoz.',
  'sync.opened':
    'Megnyílt a Google Alerts. A szinkronizáláshoz nyomd meg újra a Signalpost gombját.',
  'sync.openFirst': 'Nyisd meg a Google Alerts oldalt, majd próbáld újra.',
  'sync.reload': 'Töltsd újra a Google Alerts oldalt, majd próbáld újra.',
  'sync.disabled': 'Az automatikus szinkronizálás ki van kapcsolva.',
  'sync.appOpened': 'Megnyílt a Signalpost.',
  'sync.idle': 'Még nem történt szinkronizálás.',
  'error.generic': 'A művelet nem sikerült. Próbáld újra.',
  'error.network':
    'A szerver nem érhető el. Ellenőrizd az internetkapcsolatot és a szerver beállításait, majd próbáld újra.',
  'error.timeout': 'A kérés túllépte az időkorlátot. Próbáld újra.',
  'error.cancelled': 'A művelet megszakadt. Ha készen állsz, próbáld újra.',
  'error.identityChanged':
    'Megváltozott a fiók vagy a szerver. Szinkronizálj újra a jelenlegi fiókból.',
  'error.sourceMismatch':
    'Ez a Google Alerts-fiók eltér a csatlakoztatott fióktól. A szinkronizálás előtt válts a megfelelő Google-fiókra.',
  'error.alertsSignIn':
    'Először jelentkezz be a Google Alertsbe, majd nyomd meg újra a Signalpost gombját.',
  'error.noRss':
    'Nem láthatók RSS-hivatkozások, ezért a Google-fiók nem ellenőrizhető. A lista kiürítéséhez használd a Beállítások → Szinkronizált források törlése műveletet.',
  'error.signalpostSignIn':
    'Először jelentkezz be a Signalpostba. Ez külön bejelentkezés a Google Alerts oldalán használt fióktól.',
  'error.alertsLoading': 'A Google Alerts még töltődik, vagy megváltozott az oldal felépítése.',
  'error.alertsIncomplete': 'A teljes értesítési lista még nem érhető el.',
  'error.showAllAlerts':
    'A teljes lista szinkronizálása előtt jelenítsd meg az összes Google Alerts-értesítést.',
  'error.missingQuery':
    'Egy értesítés keresőkifejezése nem olvasható. A korábbi lista változatlan maradt.',
  'error.incompleteAlert': 'Egy értesítés adatai hiányosak. A korábbi lista változatlan maradt.',
  'error.ambiguousFeed':
    'Egy értesítés RSS-hivatkozásai nem egyértelműek. A korábbi lista változatlan maradt.',
  'error.invalidFeed':
    'A Google ismeretlen formátumú forráscímet adott. A korábbi lista változatlan maradt.',
  'error.duplicateFeed':
    'Ismétlődő forráshivatkozásokat találtunk. A korábbi lista változatlan maradt.',
  'error.multipleSources':
    'Több Google-fiók értesítéseit találtuk. A korábbi lista változatlan maradt.',
  'error.createRss':
    'Először hozz létre egy RSS-értesítést, hogy a Signalpost azonosíthassa ezt a Google Alerts-fiókot.',
  'error.emptyUnconfirmed':
    'Az értesítési lista üres, de nem állapítható meg, hogy betöltődött-e. A szinkronizált lista törlését a Signalpost beállításaiban erősítheted meg.',
  'error.serverOrigin': 'Csak a szerver alapcímét add meg, útvonal és belépési adatok nélkül.',
  'error.serverHttps': 'Használj HTTPS-címet; HTTP csak helyi fejlesztői szervernél engedélyezett.',
  'error.authIncomplete': 'A Google-bejelentkezés nem fejeződött be. Próbáld újra.',
  'error.authCallback': 'A bejelentkezési válasz nem ellenőrizhető. Próbáld újra.',
  'error.authConfiguration':
    'A bejelentkezés nem sikerült. Ellenőrizd a szerver OAuth-beállításait.',
  'error.authServerChanged':
    'Bejelentkezés közben megváltozott a szerver. Indítsd újra a bejelentkezést a jelenlegi szerverhez.',
  'error.signOutServer':
    'A szerveroldali kijelentkezés nem sikerült; a helyi munkamenetet töröltük.',
  'error.sessionExpired': 'A Signalpost-munkamenet lejárt. Jelentkezz be újra.',
  'error.serverPermission':
    'Nem engedélyezted a szerver elérését. A beállítások változatlanok maradtak.',
  'error.adminRequired': 'Ehhez rendszergazdai fiók szükséges.',
  'error.notFound': 'A kért elem nem található. Frissítsd az adatokat, majd próbáld újra.',
  'error.invalidInput': 'Ellenőrizd a megadott adatokat, majd próbáld újra.',
  'error.conflict':
    'A művelet a jelenlegi állapotban nem végezhető el. Frissítsd az adatokat, majd próbáld újra.',
  'error.server': 'A szerver nem tudta végrehajtani a műveletet. Próbáld újra.',
  'error.rateLimit': 'Túl sok kérés érkezett. Várj egy kicsit, majd próbáld újra.',
  'error.changeChannel': 'A kézbesítési csatorna módosításához hozz létre új célállomást.',
  'error.targetRequired': 'Az új célállomáshoz kézbesítési címet is meg kell adni.',
  'error.feedLimit': 'Legfeljebb 1000 forrás adható meg.',
  'error.destinationLimit': 'Legfeljebb 100 célállomás adható meg.',
  'error.retryState': 'Csak a várakozó vagy sikertelen kézbesítések próbálhatók újra.',
  'error.retryDisabled': 'Az újrapróbálás előtt engedélyezd a forrást és a célállomását.',
  'error.emailAddress': 'Adj meg egy érvényes e-mail-címet.',
  'error.slackWebhook': 'Adj meg egy HTTPS-alapú hooks.slack.com/services webhook-címet.',
  'error.feedNetwork': 'A forrás lekérése sikertelen volt vagy túllépte az időkorlátot.',
  'error.feedHttp': 'A forrás lekérése sikertelen (HTTP {status}).',
  'error.feedXml': 'A forrás nem biztonságos, szabályos RSS- vagy Atom-XML.',
  'error.feedSize': 'A forrás válasza túllépte a méretkorlátot.',
  'error.feedEmpty': 'A forrás válasza üres.',
  'error.feedItemLimit': 'A forrás túllépte a 2000 elemes korlátot.',
  'error.feedItem': 'A forrás hibás elemet vagy érvénytelen cikkhivatkozást tartalmaz.',
  'error.slackNetwork': 'A Slack-kérés sikertelen volt vagy túllépte az időkorlátot.',
  'error.slackHttp': 'A Slack elutasította az értesítést (HTTP {status}).',
  'error.mailStart': 'A helyi levélküldő nem indítható el.',
  'error.mailTimeout': 'A helyi levélküldő túllépte az időkorlátot.',
  'error.mailRejected': 'A helyi levélküldő elutasította az átadást (kilépési kód: {status}).',
  'error.notificationSubject': 'Az értesítés tárgya érvénytelen.',
  'error.channelUnavailable': 'Az értesítési csatorna nem érhető el.',
  'error.channelTarget': 'A célállomás nem felel meg az értesítési csatornának.',
  'error.notificationRejected': 'Az értesítés átadása nem sikerült.',
} satisfies Record<keyof typeof en, Message>;

export default hu;
