# Prompt 007 — locate Google Alerts RSS setting

Date: 2026-10-18. Tool: Codex desktop.
The user attached a screenshot of the Google Alerts list in Safari.
It shows three alerts with edit/delete controls and no RSS icons.
Per-alert delivery settings are not expanded.

```text
Wait a fucking minute. Megírtam a böszme specit, erre most veszem észre, hogy a Google kivezette az RSS végpontot az alertekről? Nem találom sehol. Hol kéne legyen?
```

Research response: the screenshot does not establish removal. Delivery
must be inspected through each alert's pencil/edit control and Deliver to
dropdown. Feeder's integration guide describes RSS delivery and notes that
Digest/Delivery time settings can prevent selection. Feedmarkdown reports
a direct personal-account test on 2026-10-08 with RSS creation and a feed
HTTP response. These are published observations, not a live verification
of this user's account. No user settings were modified.

Sources:

- https://feeder.co/help/rss/add-google-alerts-to-feeder/
- https://feedmarkdown.com/blog/google-alerts-rss-feed/
- https://developers.google.com/data-portability/schema-reference/alerts

Correction boundary: prior research confirmed documentation and existing
client code; it had not verified the actual user-account UI or feed.
