#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './init.js';
import { testCommand } from './test.js';

const program = new Command();

program.name('sync').description('GitHub ↔ Jira Sync CLI').version('1.0.0');

program
  .command('init')
  .description('Initialize a new sync configuration')
  .option('-o, --output <file>', 'Output file path', 'sync-config.yaml')
  .action(initCommand);

program
  .command('test')
  .description('Test a sync configuration')
  .requiredOption('-c, --config <file>', 'Config file path')
  .option('--github-owner <owner>', 'GitHub owner')
  .option('--github-repo <repo>', 'GitHub repository')
  .option('--github-issue <number>', 'GitHub issue number')
  .option('--jira-key <key>', 'Jira issue key')
  .option('--direction <direction>', 'Sync direction', 'github_to_jira')
  .action(testCommand);

program.parse();




