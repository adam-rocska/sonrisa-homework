import type { Message, MessageParams } from './types';

export function renderMessage(
  message: Message,
  language: string,
  params: MessageParams = {},
): string {
  const template =
    typeof message === 'string'
      ? message
      : (message[
          new Intl.PluralRules(language).select(
            typeof params['count'] === 'number' ? params['count'] : 0,
          )
        ] ?? message.other);
  const numbers = new Intl.NumberFormat(language);
  // Text only: callers render React text nodes, never HTML from translations.
  return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (placeholder: string, key: string) => {
    const value = params[key];
    return typeof value === 'number' ? numbers.format(value) : (value ?? placeholder);
  });
}
