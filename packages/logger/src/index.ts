import pino from 'pino';

// Determine log level from environment variable, default to 'info'
const logLevel = (process.env.LOG_LEVEL as pino.Level) || 'info';

// Create a pino logger instance
const logger = pino({
  level: logLevel,
  // Use pino-pretty for development, JSON for production
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        }
      : undefined,
});

// Export the logger instance
export default logger;

// Also export a function to create child bindings if needed
export function createChildLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
