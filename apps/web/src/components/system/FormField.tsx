import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

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
  options: Array<[string, string]>;
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
}: {
  children: ReactNode;
  tone?: 'error' | 'success';
}) {
  return <p className={`form-status${tone ? ` form-status--${tone}` : ''}`}>{children}</p>;
}
