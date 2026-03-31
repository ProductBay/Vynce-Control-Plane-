const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const normalizeMultiline = (value) => value.replace(/\\n/g, '\n');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CONTROL_PLANE_BASE_URL: z.string().url('CONTROL_PLANE_BASE_URL must be a valid URL'),
  ADMIN_API_SECRET: z.string().min(24, 'ADMIN_API_SECRET must be at least 24 characters'),
  JWT_SIGNING_PRIVATE_KEY: z.string().min(1, 'JWT_SIGNING_PRIVATE_KEY is required'),
  JWT_SIGNING_PUBLIC_KEY: z.string().min(1, 'JWT_SIGNING_PUBLIC_KEY is required'),
  ACTIVATION_TOKEN_TTL: z.string().default('12h'),
  STATUS_TOKEN_TTL: z.string().default('10m'),
  CORS_ALLOWED_ORIGINS: z.string().default('*'),
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  API_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(300),
  ACTIVATE_IP_WINDOW_SECONDS: z.coerce.number().int().positive().default(300),
  ACTIVATE_TENANT_WINDOW_SECONDS: z.coerce.number().int().positive().default(300),
  ACTIVATE_IP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(12),
  ACTIVATE_TENANT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(20)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = {
  ...parsed.data,
  JWT_SIGNING_PRIVATE_KEY: normalizeMultiline(parsed.data.JWT_SIGNING_PRIVATE_KEY),
  JWT_SIGNING_PUBLIC_KEY: normalizeMultiline(parsed.data.JWT_SIGNING_PUBLIC_KEY)
};

module.exports = { env };
