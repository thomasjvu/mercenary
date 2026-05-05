// Configuration Validator for Boss Raid
// Validates required environment variables and provides typed configuration

import { z } from 'zod';

// Define the configuration schema
export const ConfigSchema = z.object({
  // Required API configuration
  BOSSRAID_API_BASE_URL: z.string().url(),
  BOSSRAID_WEB_BASE_URL: z.string().url(),
  BOSSRAID_OPS_BASE_URL: z.string().url(),

  // Security configuration
  BOSSRAID_ENCRYPTION_KEY: z.string().min(32, 'Encryption key must be at least 32 characters'),
  BOSSRAID_ADMIN_TOKEN: z.string().optional(), // Optional but recommended

  // Database configuration (if applicable)
  BOSSRAID_DATABASE_URL: z.string().url().optional(),

  // External service configuration
  VENICE_API_URL: z.string().url().optional(),
  VENICE_API_KEY: z.string().optional(),

  // Feature flags
  BOSSRAID_FEATURE_ADAPTIVE_PLANNING: z
    .preprocess((val) => val === 'true' || val === true, z.boolean())
    .default(true),

  BOSSRAID_FEATURE_X402_PAYMENTS: z
    .preprocess((val) => val === 'true' || val === true, z.boolean())
    .default(true),

  // Logging configuration
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  // Server configuration
  PORT: z.string().regex(/^\d+$/).transform(Number).default('8787'),
  HOST: z.string().ip().default('0.0.0.0'),
});

// Type inference for our config
export type Config = z.infer<typeof ConfigSchema>;

// Cache for validated config
let cachedConfig: Config | null = null;

/**
 * Validates and returns the application configuration
 * @throws {z.ZodError} if validation fails
 */
export function getConfig(): Config {
  if (cachedConfig !== null) {
    return cachedConfig;
  }

  // Validate environment variables against our schema
  const result = ConfigSchema.safeParse(process.env);

  if (!result.success) {
    const errorMessages = result.error.issues
      .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Configuration validation failed:\n${errorMessages}\n\n` +
        `Please check your environment variables and ensure all required values are set.`
    );
  }

  cachedConfig = result.data;
  return cachedConfig;
}

/**
 * Resets the cached configuration (mainly for testing)
 */
export function resetConfig(): void {
  cachedConfig = null;
}

/**
 * Validates configuration without caching (useful for testing)
 */
export function validateConfig(): Config {
  const result = ConfigSchema.safeParse(process.env);

  if (!result.success) {
    const errorMessages = result.error.issues
      .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`Configuration validation failed:\n${errorMessages}`);
  }

  return result.data;
}

export default {
  getConfig,
  resetConfig,
  validateConfig,
  ConfigSchema,
};
