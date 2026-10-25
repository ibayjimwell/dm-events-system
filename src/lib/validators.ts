import { z } from 'zod';
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/max';

// Restricting symbols is a product requirement, not SQL injection protection.
// Keep parameterized Drizzle queries and server-side validation.
export const newPassword = z
  .string()
  .min(12, 'Password must contain at least 12 characters.')
  .max(128, 'Password cannot exceed 128 characters.')
  .regex(/[a-z]/, 'Include at least one lowercase letter.')
  .regex(/[A-Z]/, 'Include at least one uppercase letter.')
  .regex(/[0-9]/, 'Include at least one number.')
  .regex(
    /^[A-Za-z0-9!@$%&*?_.]+$/,
    'Allowed symbols: ! @ $ % & * ? _ . (letters and numbers are also allowed).'
  );

export const PASSWORD_RULE =
  '12–128 characters. Include uppercase, lowercase and a number. Allowed symbols: ! @ $ % & * ? _ .';

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Full name must contain at least 2 characters.')
  .max(180, 'Full name cannot exceed 180 characters.')
  .regex(/^[\p{L}\p{M}][\p{L}\p{M} .]*$/u, 'Use letters, spaces, and periods only.');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email address is required.')
  .email('Enter a valid email address.')
  .max(320, 'Email address is too long.');

const supportedCountries = getCountries();
const supportedCountrySet = new Set<string>(supportedCountries);

export const phoneCountrySchema = z.custom<CountryCode>(
  (value): value is CountryCode =>
    typeof value === 'string' && supportedCountrySet.has(value),
  { message: 'Select a valid country.' }
);
export type PhoneCountry = CountryCode;

const nameOverrides: Partial<Record<CountryCode, string>> = {
  AC: 'Ascension Island',
  TA: 'Tristan da Cunha',
  XK: 'Kosovo',
};

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

// Dynamically includes the full country and territory list supported by libphonenumber-js.
export const PHONE_COUNTRIES: ReadonlyArray<{
  iso: PhoneCountry;
  label: string;
  dialingCode: string;
}> = supportedCountries
  .map((iso) => ({
    iso,
    label: nameOverrides[iso] ?? regionNames.of(iso) ?? iso,
    dialingCode: `+${getCountryCallingCode(iso)}`,
  }))
  .sort((a, b) => a.label.localeCompare(b.label, 'en'));

/** Validate the selected country's local number and return international E.164. */
export function normalizePhoneNumber(
  nationalNumber: string,
  country: PhoneCountry
): string | null {
  const input = nationalNumber.trim();
  if (!/^\+?[0-9\s()-]{4,28}$/.test(input)) return null;
  if (!supportedCountrySet.has(country)) return null;

  try {
    const parsed = parsePhoneNumberFromString(input, {
      defaultCountry: country,
      extract: false,
    });
    if (!parsed?.isValid() || parsed.country !== country) return null;
    return parsed.number;
  } catch {
    return null;
  }
}

export const registrationFormSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    country: phoneCountrySchema,
    localPhone: z.string().trim().min(1, 'Contact number is required.'),
    password: newPassword,
    consent: z.literal(true, {
      errorMap: () => ({ message: 'Please accept the Privacy Policy.' }),
    }),
  })
  .superRefine((value, ctx) => {
    if (
      value.localPhone.length > 0 &&
      !normalizePhoneNumber(value.localPhone, value.country)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['localPhone'],
        message: 'Enter a valid phone number for the selected country.',
      });
    }
  });

// The registration API validates E.164 values independently of the browser.
export const registration = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{6,14}$/, 'Use a valid international phone number.')
    .refine((value) => {
      try {
        return parsePhoneNumberFromString(value)?.isValid() === true;
      } catch {
        return false;
      }
    }, 'Invalid international phone number.'),
  password: newPassword,
  consent: z.literal(true),
});

export const login = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const bookingInput = z.object({
  contactName: z.string().trim().min(2).max(180),
  contactEmail: z.string().trim().email(),
  contactPhone: z.string().trim().min(6).max(50),
  eventType: z.string().trim().min(2).max(120),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guestCount: z.coerce.number().int().min(1).max(100000),
  venue: z.string().trim().min(2).max(2000),
  estimatedBudget: z.string().trim().min(1).max(200),
  packageId: z.string().uuid().nullable().optional(),
  preferredTheme: z.string().max(400).default(''),
  colorPalette: z.string().max(400).default(''),
  specialRequests: z.string().max(5000).default(''),
  inspirationAssetId: z.string().uuid().nullable().optional(),
  consent: z.literal(true),
});

export const messageReadInput = z.object({ bookingId: z.string().uuid() });
export const messageInput = messageReadInput
  .extend({
    body: z.string().trim().max(3000).default(''),
    assetId: z.string().uuid().nullable().optional(),
  })
  .refine((value) => value.body.length > 0 || !!value.assetId, {
    message: 'Message or attachment required',
  });

export const statusInput = z.object({
  status: z.enum(['TENTATIVE', 'HELD', 'CONFIRMED', 'CANCELLED']),
  note: z.string().max(3000).optional(),
  bookedValue: z.number().nonnegative().max(999999999).nullable().optional(),
  overrideConflict: z.boolean().default(false),
});

export const packageInput = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(2).max(3000),
  inclusions: z.array(z.string().trim().min(1).max(240)).max(50),
  imageId: z.string().uuid().nullable().optional(),
  published: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
});

/** Contact email is optional for walk-in clients who only provide a phone. */
export const walkInBookingInput = bookingInput.extend({contactEmail: z.union([z.literal(''),z.string().trim().email()])});
