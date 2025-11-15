import { readFileSync } from 'fs';
import { existsSync } from 'fs';
import { parse } from 'yaml';
import { SyncService } from '../modules/sync/service.js';
import { SyncConfigSchema } from '../types/index.js';
import { appConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';

export async function testCommand(options: {
  config: string;
  githubOwner?: string;
  githubRepo?: string;
  githubIssue?: string;
  jiraKey?: string;
  direction: string;
}): Promise<void> {
  if (!existsSync(options.config)) {
    logger.error({ path: options.config }, 'Config file not found');
    process.exit(1);
  }

  const configContent = readFileSync(options.config, 'utf-8');
  const configData = parse(configContent);
  const config = SyncConfigSchema.parse(configData);

  // Override with CLI options if provided
  if (options.githubOwner) config.github.owner = options.githubOwner;
  if (options.githubRepo) config.github.repo = options.githubRepo;

  const syncService = new SyncService(
    config,
    appConfig.github.oauthToken,
    appConfig.jira.email,
    appConfig.jira.apiToken
  );

  console.log('🧪 Testing sync configuration...\n');
  console.log(`Config: ${config.name}`);
  console.log(`GitHub: ${config.github.owner}/${config.github.repo}`);
  console.log(`Jira: ${config.jira.projectKey}\n`);

  try {
    if (options.direction === 'github_to_jira') {
      if (!options.githubIssue) {
        console.error('❌ --github-issue required for github_to_jira sync');
        process.exit(1);
      }

      const issueNumber = parseInt(options.githubIssue, 10);
      console.log(`Syncing GitHub issue #${issueNumber} to Jira...`);

      const result = await syncService.syncGitHubToJira(
        config.github.owner,
        config.github.repo,
        issueNumber
      );

      if (result.success) {
        console.log('✅ Sync successful!');
        if (result.jiraIssueKey) {
          console.log(`   Jira Issue: ${result.jiraIssueKey}`);
        }
        if (result.skipped) {
          console.log(`   ⚠️  Skipped: ${result.skipReason}`);
        }
      } else {
        console.error('❌ Sync failed:', result.error);
        process.exit(1);
      }
    } else {
      if (!options.jiraKey) {
        console.error('❌ --jira-key required for jira_to_github sync');
        process.exit(1);
      }

      console.log(`Syncing Jira issue ${options.jiraKey} to GitHub...`);

      const result = await syncService.syncJiraToGitHub(options.jiraKey);

      if (result.success) {
        console.log('✅ Sync successful!');
        if (result.githubIssueNumber) {
          console.log(`   GitHub Issue: #${result.githubIssueNumber}`);
        }
        if (result.skipped) {
          console.log(`   ⚠️  Skipped: ${result.skipReason}`);
        }
      } else {
        console.error('❌ Sync failed:', result.error);
        process.exit(1);
      }
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

