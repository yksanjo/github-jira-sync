/**
 * Deduplication Service
 * Prevents duplicate processing of the same event
 */

import Redis from 'ioredis';
import { getConfig } from '../config';
import { logger } from '../logger';

// Redis client for deduplication
const redisClient = new Redis({
  host: getConfig().redis.host,
  port: getConfig().redis.port,
  password: getConfig().redis.password,
  maxRetriesPerRequest: null,
});

const DEDUP_PREFIX = 'sync:dedup:';
const DEFAULT_TTL = 300; // 5 minutes default

// ============================================================================
// CORE DEDUPLICATION
// ============================================================================

/**
 * Checks if an event is a duplicate
 * @param hash - Unique hash for the event
 * @returns true if the event has been processed recently
 */
export async function isDuplicate(hash: string): Promise<boolean> {
  const key = `${DEDUP_PREFIX}${hash}`;
  
  try {
    const exists = await redisClient.exists(key);
    return exists === 1;
  } catch (error) {
    logger.error('Error checking duplicate', { hash, error });
    // On error, assume it's not a duplicate to avoid blocking
    return false;
  }
}

/**
 * Marks an event as processed
 * @param hash - Unique hash for the event
 * @param ttl - Time to live in seconds (default: 300)
 */
export async function markAsProcessed(
  hash: string, 
  ttl: number = DEFAULT_TTL
): Promise<void> {
  const key = `${DEDUP_PREFIX}${hash}`;
  
  try {
    await redisClient.setex(key, ttl, '1');
    logger.debug('Marked as processed', { hash, ttl });
  } catch (error) {
    logger.error('Error marking as processed', { hash, error });
  }
}

/**
 * Marks an event as processed with custom data
 * @param hash - Unique hash for the event
 * @param data - Additional data to store
 * @param ttl - Time to live in seconds
 */
export async function markAsProcessedWithData(
  hash: string,
  data: Record<string, unknown>,
  ttl: number = DEFAULT_TTL
): Promise<void> {
  const key = `${DEDUP_PREFIX}${hash}`;
  
  try {
    await redisClient.setex(key, ttl, JSON.stringify(data));
    logger.debug('Marked as processed with data', { hash, ttl });
  } catch (error) {
    logger.error('Error marking as processed with data', { hash, error });
  }
}

/**
 * Gets the stored data for a processed event
 * @param hash - Unique hash for the event
 * @returns Stored data or null if not found
 */
export async function getProcessedData(
  hash: string
): Promise<Record<string, unknown> | null> {
  const key = `${DEDUP_PREFIX}${hash}`;
  
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error('Error getting processed data', { hash, error });
    return null;
  }
}

/**
 * Removes the deduplication key (allows reprocessing)
 * @param hash - Unique hash for the event
 */
export async function removeDedupKey(hash: string): Promise<void> {
  const key = `${DEDUP_PREFIX}${hash}`;
  
  try {
    await redisClient.del(key);
    logger.debug('Removed dedup key', { hash });
  } catch (error) {
    logger.error('Error removing dedup key', { hash, error });
  }
}

/**
 * Clears all deduplication keys (use with caution)
 */
export async function clearAllDedupKeys(): Promise<void> {
  try {
    const keys = await redisClient.keys(`${DEDUP_PREFIX}*`);
    if (keys.length > 0) {
      await redisClient.del(...keys);
      logger.info('Cleared all dedup keys', { count: keys.length });
    }
  } catch (error) {
    logger.error('Error clearing dedup keys', { error });
  }
}

// ============================================================================
// DEDUPLICATION HELPERS
// ============================================================================

/**
 * Generates a unique hash for an event
 * @param source - Source of the event (github, jira)
 * @param eventType - Type of event
 * @param entityId - ID of the entity
 * @param timestamp - Optional timestamp
 * @returns Unique hash string
 */
export function generateEventHash(
  source: string,
  eventType: string,
  entityId: string,
  timestamp?: string
): string {
  const crypto = require('crypto');
  const data = `${source}:${eventType}:${entityId}:${timestamp || Date.now()}`;
  return crypto.createHash('md5').update(data).digest('hex');
}

/**
 * Full deduplication processing
 * Checks for duplicate and marks as processed atomically
 * @param hash - Unique hash for the event
 * @param data - Data to store if processed
 * @param ttl - Time to live in seconds
 * @returns Object with isDuplicate flag and processing result
 */
export async function processDeduplication(
  hash: string,
  data?: Record<string, unknown>,
  ttl: number = DEFAULT_TTL
): Promise<{
  isDuplicate: boolean;
  shouldProcess: boolean;
}> {
  const key = `${DEDUP_PREFIX}${hash}`;
  
  try {
    // Use SETNX for atomic check-and-set
    const result = await redisClient.set(key, JSON.stringify(data || {}), 'EX', ttl, 'NX');
    
    if (result === 'OK') {
      return {
        isDuplicate: false,
        shouldProcess: true,
      };
    }
    
    return {
      isDuplicate: true,
      shouldProcess: false,
    };
  } catch (error) {
    logger.error('Error in processDeduplication', { hash, error });
    // On error, allow processing to avoid blocking
    return {
      isDuplicate: false,
      shouldProcess: true,
    };
  }
}

/**
 * Gets deduplication statistics
 */
export async function getDedupStats(): Promise<{
  totalKeys: number;
  keysBySource: Record<string, number>;
}> {
  try {
    const keys = await redisClient.keys(`${DEDUP_PREFIX}*`);
    
    // Group by approximate source (first part after prefix)
    const keysBySource: Record<string, number> = {};
    
    for (const key of keys) {
      const parts = key.replace(DEDUP_PREFIX, '').split(':');
      const source = parts[0] || 'unknown';
      keysBySource[source] = (keysBySource[source] || 0) + 1;
    }
    
    return {
      totalKeys: keys.length,
      keysBySource,
    };
  } catch (error) {
    logger.error('Error getting dedup stats', { error });
    return {
      totalKeys: 0,
      keysBySource: {},
    };
  }
}

/**
 * Closes the Redis connection
 */
export async function closeDedupConnection(): Promise<void> {
  await redisClient.quit();
}
