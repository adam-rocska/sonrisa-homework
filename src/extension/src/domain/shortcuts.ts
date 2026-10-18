export type AppShortcut = "commands" | "sync" | "settings" | "help" | "dismiss"
export interface KeyGesture {
  readonly key: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
  readonly isComposing: boolean
  readonly repeat: boolean
}
export function isMacPlatform(platform: string): boolean {
  return /mac|iphone|ipad/i.test(platform)
}
export function shortcutFor(event: KeyGesture, mac: boolean, editing: boolean): AppShortcut | undefined {
  if (event.isComposing || event.repeat) return undefined
  if (event.key === "Escape") return "dismiss"
  if (editing || event.altKey) return undefined
  const primary = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  if (primary && !event.shiftKey) {
    if (event.key.toLowerCase() === "k") return "commands"
    if (event.key === "Enter") return "sync"
    if (event.key === ",") return "settings"
  }
  if (!event.metaKey && !event.ctrlKey && event.key === "?") return "help"
  return undefined
}
export function isEditingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'))
}
