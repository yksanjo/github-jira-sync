import { config } from 'dotenv';
import { z } from 'zod';

config();

const ConfigSchema = z.object({
  port: z.coerce.number().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  databaseUrl: z.string().url(),
  redisUrl: z.string().url(),
  github: z.object({
    appId: z.string().optional(),
    privateKey: z.string().optional(),
    webhookSecret: z.string().optional(),
    oauthToken: z.string().optional(),
  }),
  jira: z.object({
    baseUrl: z.string().url(),
    email: z.string().email().optional(),
    apiToken: z.string().optional(),
    webhookSecret: z.string().optional(),
  }),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  syncPriority: z.enum(['github_first', 'jira_first', 'timestamp']).default('timestamp'),
});

export type Config = z.infer<typeof ConfigSchema>;

export const appConfig: Config = ConfigSchema.parse({
  port: process.env.PORT,
  nodeEnv: process.env.NODE_ENV,
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  github: {
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_PRIVATE_KEY,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    oauthToken: process.env.GITHUB_OAUTH_TOKEN,
  },
  jira: {
    baseUrl: process.env.JIRA_BASE_URL,
    email: process.env.JIRA_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
    webhookSecret: process.env.JIRA_WEBHOOK_SECRET,
  },
  logLevel: process.env.LOG_LEVEL,
  syncPriority: process.env.SYNC_PRIORITY,
});

