import winston from 'winston';

const isDev = process.env.NODE_ENV !== 'production';

// ─── Custom log format for development ───────
// Colourised, human-readable: [LEVEL] timestamp: message  { meta }

const devFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? `  ${JSON.stringify(meta)}` : '';
    return `[${level}] ${timestamp}: ${message}${metaStr}`;
  })
);

// ─── JSON format for production ────────
// Structured output — parseable by Datadog, Logtail, Render log drains, etc.

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// ─── Logger instance ─────────

export const logger = winston.createLogger({
  level: isDev ? 'http' : 'info',
  format: isDev ? devFormat : prodFormat,
  transports: [
    // Always log to console — on Render this is the only persistent output
    new winston.transports.Console(),

    // File logs for local development only
    ...(isDev
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
});
