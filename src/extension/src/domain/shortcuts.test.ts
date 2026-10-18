import { describe, expect, it } from 'vitest';
import { isMacPlatform, shortcutFor, type KeyGesture } from './shortcuts';
const key = (changes: Partial<KeyGesture>): KeyGesture => ({
  key: 'k',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  isComposing: false,
  repeat: false,
  ...changes,
});
describe('platform-aware shortcuts', () => {
  it('uses Command on Mac and Control elsewhere', () => {
    expect(isMacPlatform('MacIntel')).toBe(true);
    expect(shortcutFor(key({ metaKey: true }), true, false)).toBe('commands');
    expect(shortcutFor(key({ ctrlKey: true }), false, false)).toBe('commands');
    expect(shortcutFor(key({ ctrlKey: true }), true, false)).toBeUndefined();
  });
  it('does not steal typing, composition, repeats, or Alt chords', () => {
    expect(shortcutFor(key({ ctrlKey: true }), false, true)).toBeUndefined();
    expect(shortcutFor(key({ ctrlKey: true, isComposing: true }), false, false)).toBeUndefined();
    expect(shortcutFor(key({ ctrlKey: true, repeat: true }), false, false)).toBeUndefined();
    expect(shortcutFor(key({ ctrlKey: true, altKey: true }), false, false)).toBeUndefined();
  });
  it('supports Escape while editing and contextual help', () => {
    expect(shortcutFor(key({ key: 'Escape' }), true, true)).toBe('dismiss');
    expect(shortcutFor(key({ key: '?', shiftKey: true }), false, false)).toBe('help');
  });
});
