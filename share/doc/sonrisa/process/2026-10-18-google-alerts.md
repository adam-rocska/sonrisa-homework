# Google Alerts integration feasibility

Research date: 2026-10-18. No implementation decision made.

## Findings

No supported public Google Alerts CRUD API or write OAuth scope was
found in the official documentation reviewed. Google's user help
documents creation, editing and deletion through the Alerts website.

There IS an official OAuth integration for exporting subscriptions:
Data Portability API, scope
`https://www.googleapis.com/auth/dataportability.alerts.subscriptions`.
It exports a JSON copy of subscriptions and filters. It has archive-job
operations, not subscription create/update/delete operations. This
corrects an overly broad potential claim that Alerts has no API at all.

The unofficial `adasq/google-alerts-api` implements list/create/modify/
remove. Source inspection shows cookie authentication and HTTP POSTs to
Google's undocumented `/alerts/create`, `/alerts/modify` and
`/alerts/delete` endpoints with an `x` parameter obtained from page state.
Reading requires parsing website state. This is not an OAuth integration.
The Python `9b/google-alerts` project also exposes CRUD via web scripting.

GitHub API inspection reported the Node repository's `pushed_at` as
2022-06-01, and an open 2021 issue reports interrupted operation. These
are maintenance signals, not proof that every operation is broken today.
No library was installed or run against an authenticated Google account.

## Implications for a UI controlling the user's own account

- Official web-app OAuth CRUD: no documented supported route found.
- RSS ingestion: feasible input integration; a feed URL does not grant
  control over the Google subscription's settings.
- Cookie-based backend adapter: technically evidenced by existing
  implementations, but current compatibility is unverified. It requires
  each user's authenticated Google session, not just app sign-in. Session
  expiry, authentication challenges and website changes need handling.
- Local browser extension or user-authorized browser automation: a
  plausible route to operate the user's signed-in Alerts UI without
  exporting session cookies to our backend. This is an engineering
  inference from extension capabilities, not a verified Alerts adapter.
  It requires a local browser/extension and remains coupled to Google's
  UI. An ordinary independent website cannot simply inherit that access.

If Google-side CRUD is essential, first validate a disposable alert's
create/read/update/delete cycle in a dedicated test context. Until then,
do not present it as a working integration. The user has not requested
that experiment yet. RSS import is the simpler optional integration;
the user would manage the original subscription in Google's UI.

## Sources reviewed

- [Google Alerts help](https://support.google.com/websearch/answer/4815696?hl=en)
- [Official OAuth scopes](https://developers.google.com/identity/protocols/oauth2/scopes)
- [Alerts export schema](https://developers.google.com/data-portability/schema-reference/alerts)
- [Data Portability REST methods](https://developers.google.com/data-portability/reference/rest)
- [Node client](https://github.com/adasq/google-alerts-api)
- [Request implementation](https://github.com/adasq/google-alerts-api/blob/master/src/request-handler.js)
- [API implementation](https://github.com/adasq/google-alerts-api/blob/master/src/api.js)
- [Open issue 43](https://github.com/adasq/google-alerts-api/issues/43)
- [Repository metadata](https://api.github.com/repos/adasq/google-alerts-api)
- [Python client](https://github.com/9b/google-alerts)
- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)

Search queries included Google Alerts API CRUD/OAuth, unofficial clients,
official Alerts help and Data Portability Alerts documentation. Google
Workspace Alert Center and Cloud Monitoring results concern different
products and were excluded as solutions to this question.

Validation boundary: documentation, repository code and metadata only.
No Google Alerts settings were read from or modified in the user's
account. No live CRUD, feed polling or extension prototype was tested.
