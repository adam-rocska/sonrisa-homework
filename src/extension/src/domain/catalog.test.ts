// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { inspectAlerts } from "./catalog"
const rss = (query = "climate", source = "123", feed = "456"): string => `<li class="alert_instance"><div class="delivery_settings_view"><div class="query_div"><span>${query}</span></div><a href="/alerts/feeds/${source}/${feed}">RSS</a></div></li>`
const page = (rows: string, extras = ""): Document => new DOMParser().parseFromString(`<div class="main-page" data-signed_in="1"><div id="manage-alerts-div">${rows}</div>${extras}</div>`, "text/html")
describe("Google Alerts complete snapshot adapter", () => {
  it("extracts queries without HTML and canonical RSS addresses", () => {
    expect(inspectAlerts(page(rss("A &amp; B")))).toEqual({ status: "ready", snapshot: { sourceId: "123", feeds: [{ feedUrl: "https://www.google.com/alerts/feeds/123/456", query: "A & B" }] }, emailOnlyCount: 0 })
  })
  it("ignores rendered email-only alerts", () => {
    const email = '<li class="alert_instance"><div class="delivery_settings_view"><div class="query_div"><span>mail only</span></div></div></li>'
    expect(inspectAlerts(page(email), "123")).toEqual({ status: "ready", snapshot: { sourceId: "123", feeds: [] }, emailOnlyCount: 1 })
  })
  it("never treats an unauthenticated page as empty", () => {
    const doc = page(""); doc.querySelector(".main-page")?.setAttribute("data-signed_in", "0")
    expect(inspectAlerts(doc, "123")).toEqual({ status: "signed-out" })
  })
  it.each(["<div></div>", '<div class="main-page" data-signed_in="1"></div>'])("rejects loading or changed markup", markup => {
    expect(inspectAlerts(new DOMParser().parseFromString(markup, "text/html"), "123").status).toBe("unavailable")
  })
  it("rejects an empty list without inferring readiness from unverified markup", () => {
    expect(inspectAlerts(page(""), "123").status).toBe("unavailable")
    expect(inspectAlerts(page("", '<div id="no-alerts-div">No alerts</div>'), "123").status).toBe("unavailable")
    expect(inspectAlerts(page("", '<div id="no-alerts-div">No alerts</div>')).status).toBe("unavailable")
  })
  it("rejects incomplete collapsed lists and malformed or duplicate feeds", () => {
    expect(inspectAlerts(page(rss(), '<button class="show_all_alerts">Show all</button>')).status).toBe("unavailable")
    expect(inspectAlerts(page(rss().replace("/123/456", "/123/456?odd=1"))).status).toBe("unavailable")
    expect(inspectAlerts(page(rss() + rss())).status).toBe("unavailable")
    expect(inspectAlerts(page(rss().replace("<span>climate</span>", ""))).status).toBe("unavailable")
  })
  it("rejects account changes and mixed account catalogs", () => {
    expect(inspectAlerts(page(rss()), "999").status).toBe("unavailable")
    expect(inspectAlerts(page(rss() + rss("other", "999"))).status).toBe("unavailable")
  })
  it("accepts a hidden show-all control", () => {
    expect(inspectAlerts(page(rss(), '<button class="show_all_alerts" hidden>Show all</button>')).status).toBe("ready")
  })
})
