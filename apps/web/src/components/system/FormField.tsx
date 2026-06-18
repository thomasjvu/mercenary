import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { UserErrorNote } from './UserErrorNote.js';

type FormFieldProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

export function FormField({ label, children, className = 'field' }: FormFieldProps) {
  return (
    <label className={className}>
      <span>{label}</span>
      {children}
    </label>
  );
}

type FormInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  className?: string;
};

export function FormInput({ label, className = 'field', ...inputProps }: FormInputProps) {
  return (
    <FormField className={className} label={label}>
      <input {...inputProps} />
    </FormField>
  );
}

type FormSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  className?: string;
  options: ReadonlyArray<readonly [string, string]>;
};

export function FormSelect({
  label,
  className = 'field',
  options,
  ...selectProps
}: FormSelectProps) {
  return (
    <FormField className={className} label={label}>
      <select {...selectProps}>
        {options.map(([value, optionLabel]) => (
          <option key={value} value={value}>
            {optionLabel}
          </option>
        ))}
      </select>
    </FormField>
  );
}

export function FormStatus({
  children,
  tone,
  variant = 'error',
}: {
  children: ReactNode;
  tone?: 'error' | 'success';
  variant?: 'guide' | 'error';
}) {
  if (tone === 'error') {
    return <UserErrorNote variant={variant}>{children}</UserErrorNote>;
  }

  return <p className={`form-status${tone ? ` form-status--${tone}` : ''}`}>{children}</p>;
}
