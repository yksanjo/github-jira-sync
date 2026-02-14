/**
 * Configuration loader with validation using Zod
 * Loads and validates environment variables
 */

import { z } from 'zod';
import { AppConfigSchema, AppConfig } from './types';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config();

const envSchema = z.object({
  // GitHub
  GITHUB_WEBHOOK_SECRET: z.string().min(1),
  GITHUB_TOKEN: z.string().min(1),
  GITHUB_ORG: z.string().min(1),
  GITHUB_REPO: z.string().min(1),
  
  // Jira
  JIRA_HOST: z.string().min(1),
  JIRA_EMAIL: z.string().email(),
  JIRA_API_TOKEN: z.string().min(1),
  JIRA_PROJECT_KEY: z.string().min(1).max(10),
  
  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  
  // Queue
  QUEUE_CONCURRENCY: z.coerce.number().default(10),
  QUEUE_MAX_RETRIES: z.coerce.number().default(3),
  QUEUE_RETRY_DELAY: z.coerce.number().default(5000),
  
  // App
  APP_PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  
  // Monitoring
  PROMETHEUS_PORT: z.coerce.number().default(9090),
  METRICS_ENABLED: z.coerce.boolean().default(true),
});

type EnvSchema = z.infer<typeof envSchema>;

/**
 * Loads and validates environment configuration
 */
export function loadConfig(): AppConfig {
  const env = envSchema.parse(process.env);
  
  const config: AppConfig = {
    github: {
      webhookSecret: env.GITHUB_WEBHOOK_SECRET,
      token: env.GITHUB_TOKEN,
      org: env.GITHUB_ORG,
      repo: env.GITHUB_REPO,
    },
    jira: {
      host: env.JIRA_HOST,
      email: env.JIRA_EMAIL,
      apiToken: env.JIRA_API_TOKEN,
      projectKey: env.JIRA_PROJECT_KEY,
    },
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
    },
    queue: {
      concurrency: env.QUEUE_CONCURRENCY,
      maxRetries: env.QUEUE_MAX_RETRIES,
      retryDelay: env.QUEUE_RETRY_DELAY,
    },
    app: {
      port: env.APP_PORT,
      logLevel: env.LOG_LEVEL,
      nodeEnv: env.NODE_ENV,
    },
    sync: {
      conflictResolution: 'LAST_WRITE_WINS', // Default strategy
      autoSync: true,
    },
  };
  
  // Validate with full schema
  return AppConfigSchema.parse(config);
}

/**
 * Gets a specific configuration value
 */
export function getConfig(): AppConfig {
  if (!(<any>global).__appConfig) {
    (<any>global).__appConfig = loadConfig();
  }
  return (<any>global).__appConfig;
}

// Global config singleton
declare global {
  namespace NodeJS {
    interface Global {
      __appConfig?: AppConfig;
    }
  }
}
