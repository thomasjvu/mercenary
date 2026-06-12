export function ensureObject(value: unknown, field = 'object'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected object for ${field}.`);
  }

  return value as Record<string, unknown>;
}

export function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expected non-empty string for ${field}.`);
  }

  return value;
}

export function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function asBooleanWithDefault(value: unknown, fallback: boolean, field: string): boolean {
  if (value == null) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }

  throw new Error(`Expected boolean for ${field}.`);
}

export function asPositiveNumberWithDefault(
  value: unknown,
  fallback: number,
  field: string
): number {
  if (value == null) {
    return fallback;
  }

  const parsed = asFiniteNumber(value, field);
  if (parsed <= 0) {
    throw new Error(`Expected positive number for ${field}.`);
  }

  return parsed;
}

export function asFiniteNumber(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error(`Expected finite number for ${field}.`);
}
