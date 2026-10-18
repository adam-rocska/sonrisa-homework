# Google Alerts and Signalpost: end-user guide

This pilot runs in Chrome/Chromium on a desktop. Your administrator must
first configure the server, Google sign-in and mail transport. Signalpost
has two places you use: Google's existing Alerts page and the extension's
own dashboard. The Google login and the Signalpost login are separate.

## Start Signalpost

1. Pin Signalpost to the Chrome toolbar.
2. Open its **Options** page from the extension's menu. You can also use
   the dashboard keyboard shortcut configured in Chrome.
3. In **Settings**, verify the **Server address** supplied by your
   administrator. Local development uses `http://localhost:3000`.
4. Choose **Continue with Google**. Use the Google account whose alerts
   you intend to synchronize. No payment or paid auth subscription is needed.

The app session is held in trusted extension session storage and disappears
when the browser closes. Server polling and delivery continue even while
the browser is closed. Sign in again to manage or synchronize your catalog.

## Language and layout

Open **Settings → Language and layout** (**Beállítások → Nyelv és
elrendezés**). Choose English, Magyar, or **Use browser language**. The
choice is saved immediately for this browser, independently of the server
connection. Unsupported browser languages fall back to English.

**Text direction** normally follows the selected language. Both included
translations use left-to-right text. Choose **Right to left** to use or
inspect the mirrored layout; this does not translate English or Hungarian
into another language. Names and mixed-direction content are isolated so
they do not reorder surrounding labels. URLs, email addresses and keyboard
shortcuts retain their normal reading direction.

Changing Signalpost's language does not change Google's UI, your search
queries, article content or notification destinations. The English labels
used in this guide have corresponding Hungarian labels in the app. See
[localization](localization.md) for scope and adding another translation.

## Create an alert and select RSS in Google

1. Open [Google Alerts](https://www.google.com/alerts). Pressing the
   Signalpost toolbar button from another page opens it for you.
2. Sign into Google if necessary. Signalpost cannot read a signed-out page;
   its manual action explains that you need to sign in first.
3. Enter a topic or search expression. Open **Show options** and choose
   the source, language, region, frequency and result count that you want.
4. Set **Deliver to → RSS feed**, then create the alert.
5. For an existing alert, click its pencil icon, change **Deliver to** to
   **RSS feed**, and save/update the alert. The RSS icon/link then appears
   on that alert's row. It is an individual alert setting, not the global
   settings gear. Hungarian Google UI labels may be localized.

Google controls what matches and when new items are published. Switching an
alert from email to RSS changes Google's delivery method for that alert.
Signalpost will provide the email delivery you separately configure below.
Alerts left on Google's email delivery are skipped during import.

## Synchronize and route notifications

1. Keep Google Alerts open and let its list finish loading. If Google shows
   a control for displaying all alerts, expand the complete list first.
2. Press the Signalpost **toolbar icon**. When you are already on the
   Alerts page, it reads the RSS links and queries and replaces your server
   catalog with that complete snapshot. A native notification reports the
   result. The icon does not open a popup dashboard.
3. Open Signalpost Options → **Destinations**. Add a named email address or
   Slack incoming webhook. Your administrator must have configured email;
   Slack requires a webhook for a channel you control.
4. In **My feeds**, select the destinations for each feed, leave **Watch
   this feed** enabled and press **Save routing**.
5. Use **Delivery activity** to see attempts and results. **Accepted**
   means the mail transport or Slack accepted the message; it does not
   guarantee inbox delivery or that anyone read it.

The first successful feed fetch records a baseline. It deliberately does
not send all old articles. Notifications start with entries first observed
after that baseline and while the feed and selected destination are enabled.

## Change or remove alerts

Edit the search expression or delete the alert in **Google Alerts** using
Google's own pencil/trash controls. With automatic sync enabled, a page
load or settled DOM change triggers another complete snapshot. Manual
sync remains available whenever you need it. Stable feeds keep their
Signalpost routing choices when synchronized again.

Removing an RSS feed from the synchronized list stops its routing and
cancels pending deliveries. It does not delete your delivery history.
Pausing a feed or destination in Signalpost pauses its eligible work without
changing Google's alert. Removing a destination stops its routes.

If you remove **every** RSS alert, use Signalpost **Settings → Clear synced
feeds** and confirm the checkbox. An empty Google page cannot reliably
identify which Google account it belongs to, so Signalpost requires this
explicit action instead of guessing that all subscriptions should vanish.
Clearing Signalpost does not edit Google Alerts. If RSS alerts remain in
Google and automatic sync is on, they will be imported again when that page
loads or changes.

Use the same connected Google Alerts account. A switch to another account
is rejected when its feed source differs. This pilot does not merge several
Google Alerts accounts into one Signalpost catalog.

## Keyboard and accessibility

Every control supports normal Tab/Shift+Tab navigation and visible focus.
Use Space for checkboxes and Enter for buttons. The Commands dialog offers
navigation without memorizing each screen.

| Action inside Signalpost | macOS | Windows/Linux |
| --- | --- | --- |
| Commands | Cmd+K | Ctrl+K |
| Sync | Cmd+Enter | Ctrl+Enter |
| Settings | Cmd+, | Ctrl+, |
| Help | ? | ? |
| Close Commands | Escape | Escape |

Default browser-wide commands are Cmd/Ctrl+Shift+Y for the toolbar action
and Cmd/Ctrl+Shift+U for the dashboard. Chrome may reserve shortcuts or
leave them unassigned. Inspect/change them at `chrome://extensions/shortcuts`.
Shortcuts avoid text-entry controls so editing a field remains predictable.

## Administrator view

Authorized accounts see **Administration** with server-wide counts and
recent delivery attempts. A failed delivery can be retried after correcting
its cause. Server authorization decides access; an ordinary account cannot
acquire it by opening a different UI section.

## Validation note

The steps and UI labels were checked against the implemented dashboard
and the observed Google Alerts DOM. The real Chrome installation, OAuth
round trip and notification receipt still require the operator acceptance
steps in [verification](verification.md). No Google alert was modified
during documentation preparation.
