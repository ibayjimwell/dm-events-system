'use client';
import { PHONE_COUNTRIES, type PhoneCountry } from '@/lib/validators';

type Props = {
  id: string;
  label: string;
  country: PhoneCountry;
  number: string;
  onCountryChange: (value: PhoneCountry) => void;
  onNumberChange: (value: string) => void;
  required?: boolean;
  hint?: string;
};
/** Shared phone field uses international dialing codes and retains the local user's input. */
export default function CountryPhoneInput({
  id, label, country, number, onCountryChange, onNumberChange, required = true, hint,
}: Props) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-[#122c44]">{label}</label>
      <div className="flex min-w-0 flex-col gap-2 min-[440px]:flex-row">
        <select
          aria-label={`${label}: country calling code`}
          className="min-h-11 w-full min-w-0 rounded-lg border border-[#cbd9e6] bg-white px-2.5 py-2 text-sm text-[#122c44] outline-none focus:border-[#0b4d98] focus:ring-2 focus:ring-[#0b4d98]/15 min-[440px]:w-[43%]"
          value={country}
          onChange={(event) => onCountryChange(event.target.value as PhoneCountry)}
        >
          {PHONE_COUNTRIES.map((option) => (
            <option key={option.iso} value={option.iso}>
              {option.label} ({option.dialingCode})
            </option>
          ))}
        </select>
        <input
          id={id}
          className="min-h-11 w-full min-w-0 flex-1 rounded-lg border border-[#cbd9e6] bg-white px-3 py-2 text-sm text-[#122c44] outline-none focus:border-[#0b4d98] focus:ring-2 focus:ring-[#0b4d98]/15"
          type="tel"
          autoComplete="tel-national"
          inputMode="tel"
          required={required}
          value={number}
          onChange={(event) => onNumberChange(event.target.value)}
          placeholder={country === 'PH' ? '09123456789' : 'Local phone number'}
        />
      </div>
      {hint && <p className="mt-1.5 text-xs text-[#748498]">{hint}</p>}
    </div>
  );
}
