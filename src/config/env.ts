import 'dotenv/config';
import { z } from 'zod';

/** Environment variables arrive as strings; parse booleans explicitly. */
const booleanFlag = (defaultValue: 'true' | 'false') =>
  z
    .string()
    .default(defaultValue)
    .transform((value) => ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase()));

/**
 * Every environment variable the app reads is declared here.
 * The process refuses to boot with an invalid or incomplete configuration,
 * so the rest of the codebase can rely on `env` being fully typed and valid.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // 0 is allowed: it lets the OS assign an ephemeral port (handy for tests).
    PORT: z.coerce.number().int().min(0).max(65535).default(5000),

    API_PREFIX: z
      .string()
      .trim()
      .startsWith('/', 'API_PREFIX must start with "/"')
      .default('/api/v1'),

    MONGODB_URI: z
      .string()
      .trim()
      .min(1, 'MONGODB_URI is required')
      .refine(
        (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
        'MONGODB_URI must start with mongodb:// or mongodb+srv://',
      ),

    CORS_ORIGIN: z.string().trim().default('*'),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    TRUST_PROXY: z.coerce.number().int().min(0).default(0),

    // --- Authentication / JWT ---------------------------------------------
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().trim().default('15m'),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_REFRESH_EXPIRES_IN: z.string().trim().default('30d'),
    JWT_ISSUER: z.string().trim().default('wishbox'),
    /** How many devices can stay logged in at once. */
    AUTH_MAX_SESSIONS: z.coerce.number().int().min(1).max(20).default(5),

    // --- OTP ---------------------------------------------------------------
    OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(10).max(300).default(30),
    /** Development shortcut: include the code in the API response. */
    OTP_DEBUG_RETURN_CODE: booleanFlag('false'),

    // --- Login code delivery -----------------------------------------------
    // console = log only | gateway = wishbox messaging gateway | twilio
    WHATSAPP_PROVIDER: z.enum(['console', 'gateway', 'twilio']).default('console'),
    AUTH_CHANNEL: z.enum(['whatsapp', 'sms']).default('whatsapp'),

    // --- Wishbox messaging gateway (WhatsApp templates) ---------------------
    SMS_API_URL: z
      .string()
      .trim()
      .min(1)
      .default('https://whatsapp-services-8t87.onrender.com/api/messaging/messages/send'),
    /** Bearer token for the gateway. Required when WHATSAPP_PROVIDER=gateway. */
    SMS_API_TOKEN: z.string().trim().optional(),
    /** Template variable that carries the OTP code. */
    SMS_API_VARIABLES_KEY: z.string().trim().default('code'),
    SMS_OTP_TEMPLATE_ID: z.string().trim().default('6aa397f544cd4f83cc61db41'),
    SMS_BOOKING_TEMPLATE_ID: z.string().trim().default('6aad0af6fdcd1a027b9e4389'),
    SMS_ADMIN_TEMPLATE_ID: z.string().trim().optional(),
    /** Booking confirmations can go to a different gateway instance. */
    SMS_BOOKING_API_URL: z.string().trim().optional(),
    /** Every gateway template carries a header image, so one is always sent. */
    SMS_MEDIA_URL: z
      .string()
      .trim()
      .min(1)
      .default(
        'https://res.cloudinary.com/dftt4ow6q/image/upload/v1789112613/fmxa9igwfibetwuc5pr8.jpg',
      ),
    /** The gateway is on a free tier that can cold-start for 30s+. */
    SMS_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
    SMS_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),

    // --- Twilio ------------------------------------------------------------
    TWILIO_ACCOUNT_SID: z.string().trim().optional(),
    TWILIO_AUTH_TOKEN: z.string().trim().optional(),
    TWILIO_SMS_FROM: z.string().trim().optional(),
    TWILIO_WHATSAPP_FROM: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    const requireWith = (
      key: 'TWILIO_ACCOUNT_SID' | 'TWILIO_AUTH_TOKEN' | 'TWILIO_SMS_FROM' | 'TWILIO_WHATSAPP_FROM',
      message: string,
    ) => {
      if (!data[key]) {
        ctx.addIssue({ code: 'custom', path: [key], message });
      }
    };

    if (data.WHATSAPP_PROVIDER === 'gateway') {
      if (!data.SMS_API_TOKEN) {
        ctx.addIssue({
          code: 'custom',
          path: ['SMS_API_TOKEN'],
          message: 'Required when WHATSAPP_PROVIDER=gateway',
        });
      }
    }

    if (data.WHATSAPP_PROVIDER === 'twilio') {
      requireWith('TWILIO_ACCOUNT_SID', 'Required when WHATSAPP_PROVIDER=twilio');
      requireWith('TWILIO_AUTH_TOKEN', 'Required when WHATSAPP_PROVIDER=twilio');
      if (data.AUTH_CHANNEL === 'whatsapp') {
        requireWith('TWILIO_WHATSAPP_FROM', 'Required when AUTH_CHANNEL=whatsapp');
      } else {
        requireWith('TWILIO_SMS_FROM', 'Required when AUTH_CHANNEL=sms');
      }
    }

    if (data.OTP_DEBUG_RETURN_CODE && data.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_DEBUG_RETURN_CODE'],
        message: 'Must be false in production - it leaks one-time codes to clients',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

  // The logger cannot be used yet - it depends on a valid env.
  console.error(`\n[config] Invalid environment configuration:\n${details}\n`);
  console.error('[config] Check your .env file against .env.example.\n');
  process.exit(1);
}

const data = parsed.data;

/** Parsed CORS origins. `['*']` means "allow any origin". */
export const corsOrigins: string[] = data.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

export const env = Object.freeze({
  ...data,
  IS_PRODUCTION: data.NODE_ENV === 'production',
  IS_DEVELOPMENT: data.NODE_ENV === 'development',
  IS_TEST: data.NODE_ENV === 'test',
  corsOrigins,
  /** Only ever expose OTP codes to clients outside production, on request. */
  EXPOSE_OTP_IN_RESPONSE: data.OTP_DEBUG_RETURN_CODE && data.NODE_ENV !== 'production',
});

export type Env = typeof env;
