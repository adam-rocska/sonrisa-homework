export type Direction = 'ltr' | 'rtl';
export type Message =
  string | (Partial<Record<Intl.LDMLPluralRule, string>> & { readonly other: string });
export type MessageParams = Readonly<Record<string, string | number>>;
