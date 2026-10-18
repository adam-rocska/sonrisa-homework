# Localization and bidirectional layout

Signalpost includes English (`en`) and Hungarian (`hu`) UI translations.
The extension dashboard has a browser-local language preference and a
separate layout-direction preference in **Settings → Language and layout**.
They apply immediately and do not modify server credentials, the signed-in
account, alert queries or routing.

## Language selection and scope

- Automatic selection uses the browser's preferred supported language;
  language-region variants such as `hu-HU` resolve to their base language.
  The fallback is English.
- A manual English or Magyar selection overrides browser detection.
- Navigation, forms, commands, labels, status text and extension-owned
  notifications use the selected language. Dates and numbers use locale
  formatting rather than concatenated English fragments.
- Signalpost's server-owned sign-in screens follow the extension selection.
  Direct visits use the browser's `Accept-Language` preference; unsupported
  languages fall back to English. Google's own account chooser remains under
  Google's control. Technical operator configuration diagnostics retain their
  original text.
- Google Alerts controls its own language. Feed titles, search expressions,
  destination names and article content retain their original text. This
  change does not translate delivered email/Slack content or server logs.
- Browser-native controls can still use Chrome's own language. Browser
  extension metadata is selected by Chrome, independently of the dashboard
  preference.

## RTL behavior

Both bundled languages have `ltr` as their default direction. The explicit
`rtl` preference permits exercising the mirrored layout before adding an
RTL language. It changes direction, not translation. No Arabic or Hebrew
translation is included.

The document declares its language and direction. CSS uses logical inline
and block edges and `text-align: start`; navigation, status accents, skip
links and card alignment therefore follow that direction. Narrow dashboard
panes use a single content column and wrapping navigation, and controls can
expand for longer translations. This supports a small desktop pane and
zoomed content; it does not add mobile browser-extension support.

User-authored names and titles use bidirectional isolation. Technical
addresses and keyboard chords keep their LTR direction so punctuation and
shortcut order remain readable inside an RTL page. There are no directional
arrow icons in this interface requiring separate mirroring.

## Adding a language

Keep messages in `src/extension/src/i18n/`, outside components. Add
`ui.<language>.ts` and `system.<language>.ts` with the same keys and
interpolation placeholders as their English catalogues. Register the tag,
native display name and default direction in `locales.ts`, then register
the merged catalogue in `index.ts`. The settings choices use that registry.
`format.ts` owns locale formatting and `preferences.ts` persists only
`localePreferences` in Chrome local storage, separately from server settings.
Use complete messages and locale plural rules rather than
joining translated sentence fragments. Include every plural category needed
by that language, with an `other` fallback.

When adding an RTL locale, set its default direction to `rtl`. Check mixed
Latin and RTL names, numbers, email addresses and URLs as well as translated
labels. Add a Chrome metadata catalogue under
`src/extension/assets/_locales/<language>/messages.json`. Extend the server's
small independent catalogue and language selection in
`src/server/src/auth-pages.ts` for the same sign-in journey. Native metadata
does not follow the manual language switch inside the app.

Run the localization tests, TypeScript checks and extension build. Inspect
all dashboard sections, validation states, native notifications and the
command dialog with the longest labels. Exercise both directions at normal
size and with zoom, and verify keyboard focus follows the document order.
The explicit direction control is useful for this review even with English
or Hungarian selected.

## References

- [MDN: CSS logical properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Logical_properties_and_values)
- [MDN: HTML direction](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/dir)
- [MDN: Bidirectional isolation](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/bdi)
