// Shape of tokens.json. The build and lex() both read from this single source of truth.
export type TokenCategory = Record<string, string>;

export interface Regime {
  color: TokenCategory;
  type: TokenCategory;
  geometry: TokenCategory;
  motion: TokenCategory;
}

export interface Tokens {
  theme: Record<string, Record<string, Regime>>;
  lexicon: Record<string, Record<string, string>>;
}
