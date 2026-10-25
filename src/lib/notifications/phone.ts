import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

/** Strict, server-side phone normalization. Legacy local numbers use PH only as a fallback. */
export function toE164(raw: string | null | undefined, defaultCountry: 'PH' = 'PH'): string | null {
  if (!raw?.trim()) return null;
  try {
    const number = parsePhoneNumberFromString(raw.trim(), { defaultCountry, extract: false });
    return number?.isValid() ? number.number : null;
  } catch {
    return null;
  }
}
