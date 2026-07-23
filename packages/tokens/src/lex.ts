// Typed copy resolver. Copy strings resolve through the lexicon exactly as colors resolve
// through the palette (foundations §10). Components must call lex(), never inline the string.
import tokens from "../tokens.json";

const lexicon = tokens.lexicon;

export type ThemeName = keyof typeof lexicon;
export type LexKey = keyof (typeof lexicon)["plateau"];

/**
 * Resolve a lexicon key for a theme. Plateau is the default (the Reading Room begins in
 * Plateau). Flux and Machina are present in the table but unarmed until their themes ship.
 */
export function lex(key: LexKey, theme: ThemeName = "plateau"): string {
  const table = lexicon[theme] as Record<string, string> | undefined;
  const value = table?.[key];
  if (value === undefined) {
    throw new Error(`lex: no entry for "${String(key)}" in theme "${String(theme)}"`);
  }
  return value;
}
