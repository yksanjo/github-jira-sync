# Quick Start Guide

Get up and running with GitHub ↔ Jira Sync in 5 minutes!

## Step 1: Prerequisites

Make sure you have:
- Node.js 20+ installed
- Docker and Docker Compose (for local development)
- GitHub Personal Access Token
- Jira API Token

## Step 2: Clone and Install

```bash
git clone <your-repo-url>
cd github-jira-sync
npm install
```

## Step 3: Set Up Environment

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/github_jira_sync
REDIS_URL=redis://localhost:6379
GITHUB_OAUTH_TOKEN=ghp_your_token_here
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your_jira_token
```

## Step 4: Start Services

```bash
# Start PostgreSQL and Redis
docker-compose up -d postgres redis

# Set up database
npm run db:generate
npm run db:migrate
```

## Step 5: Create Sync Configuration

```bash
npm run sync:init
```

This creates `sync-config.yaml`. Edit it:

```yaml
name: my-sync
github:
  owner: your-github-org
  repo: your-repo
jira:
  projectKey: YOURPROJ
mappings:
  status:
    "To Do": "To Do"
    "In Progress": "In Progress"
    "Done": "Done"
```

## Step 6: Load Configuration

```bash
# Start the API server
npm run dev

# In another terminal, create the config
curl -X POST http://localhost:3000/config \
  -H "Content-Type: application/json" \
  -d @sync-config.yaml
```

## Step 7: Start Worker

```bash
# In a third terminal
npm run worker
```

## Step 8: Test It!

```bash
# Test syncing a GitHub issue to Jira
npm run sync:test -- \
  --config sync-config.yaml \
  --github-owner your-github-org \
  --github-repo your-repo \
  --github-issue 1 \
  --direction github_to_jira
```

## Step 9: Set Up Webhooks

### GitHub Webhook

1. Go to your repository → Settings → Webhooks
2. Add webhook:
   - Payload URL: `https://your-domain.com/webhook/github`
   - Content type: `application/json`
   - Secret: (use `GITHUB_WEBHOOK_SECRET` from `.env`)
   - Events: Select "Issues" and "Issue comments"

### Jira Webhook

1. Go to Jira → Settings → System → Webhooks
2. Create webhook:
   - URL: `https://your-domain.com/webhook/jira`
   - Events: Select "Issue created", "Issue updated", "Comment created"

## That's It! 🎉

Your sync is now running. Create or update an issue in GitHub or Jira, and watch it sync automatically!

## Next Steps

- Read the full [README.md](./README.md) for advanced configuration
- Check out [config/example.yaml](./config/example.yaml) for more mapping examples
- Customize your sync rules in the configuration

## Troubleshooting

**Can't connect to database?**
```bash
docker-compose up -d postgres
# Wait a few seconds, then try again
```

**Worker not processing jobs?**
- Make sure Redis is running: `docker-compose up -d redis`
- Check worker logs for errors

**Webhooks not working?**
- Verify your webhook URL is publicly accessible
- Check webhook secret matches in `.env`
- Look at API logs for incoming webhooks

