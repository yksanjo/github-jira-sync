# 🚀 Deployment Guide

Complete guide to deploy GitHub ↔ Jira Sync to production.

## 📋 Pre-Deployment Checklist

- [ ] Environment variables configured
- [ ] Database migration ready
- [ ] GitHub webhook configured
- [ ] Jira webhook configured
- [ ] Domain/URL ready (for webhooks)
- [ ] SSL certificate (HTTPS required for webhooks)

## 🐳 Option 1: Docker Deployment

### Prerequisites
- Docker and Docker Compose installed
- Domain name with DNS configured
- SSL certificate (Let's Encrypt recommended)

### Steps

1. **Clone and configure:**
   ```bash
   git clone https://github.com/yksanjo/github-jira-sync.git
   cd github-jira-sync
   cp .env.example .env
   # Edit .env with your production values
   ```

2. **Update docker-compose.yml:**
   ```yaml
   services:
     postgres:
       # Keep as is
     
     redis:
       # Keep as is
     
     api:
       environment:
         DATABASE_URL: ${DATABASE_URL}
         REDIS_URL: ${REDIS_URL}
         # ... other env vars
       # Add if using reverse proxy:
       # ports:
       #   - "127.0.0.1:3000:3000"
     
     worker:
       # Same environment as api
   ```

3. **Build and start:**
   ```bash
   docker-compose build
   docker-compose up -d
   ```

4. **Run migrations:**
   ```bash
   docker-compose exec api npm run db:migrate
   ```

5. **Set up reverse proxy (Nginx):**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       return 301 https://$server_name$request_uri;
   }

   server {
       listen 443 ssl http2;
       server_name your-domain.com;

       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

## ☁️ Option 2: Railway Deployment

### Steps

1. **Install Railway CLI:**
   ```bash
   npm i -g @railway/cli
   railway login
   ```

2. **Create new project:**
   ```bash
   cd github-jira-sync
   railway init
   ```

3. **Add services:**
   - PostgreSQL (Railway will auto-create)
   - Redis (add from Railway dashboard)

4. **Set environment variables:**
   ```bash
   railway variables set DATABASE_URL=$DATABASE_URL
   railway variables set REDIS_URL=$REDIS_URL
   railway variables set GITHUB_OAUTH_TOKEN=your_token
   railway variables set GITHUB_WEBHOOK_SECRET=your_secret
   railway variables set JIRA_BASE_URL=https://your-domain.atlassian.net
   railway variables set JIRA_EMAIL=your_email
   railway variables set JIRA_API_TOKEN=your_token
   railway variables set JIRA_WEBHOOK_SECRET=your_secret
   railway variables set NODE_ENV=production
   railway variables set PORT=3000
   ```

5. **Deploy:**
   ```bash
   railway up
   ```

6. **Run migrations:**
   ```bash
   railway run npm run db:migrate
   ```

7. **Get your URL:**
   - Railway provides a URL like: `https://your-app.railway.app`
   - Use this for webhook URLs

8. **Deploy worker separately:**
   - Create a new service in Railway
   - Use the same codebase
   - Set command: `npm run worker`
   - Share the same environment variables

## ✈️ Option 3: Fly.io Deployment

### Steps

1. **Install Fly CLI:**
   ```bash
   curl -L https://fly.io/install.sh | sh
   fly auth login
   ```

2. **Initialize Fly app:**
   ```bash
   cd github-jira-sync
   fly launch
   # Follow prompts, use existing fly.toml
   ```

3. **Create PostgreSQL database:**
   ```bash
   fly postgres create --name github-jira-sync-db
   fly postgres attach --app github-jira-sync github-jira-sync-db
   ```

4. **Create Redis:**
   ```bash
   fly redis create
   # Note the connection URL
   ```

5. **Set secrets:**
   ```bash
   fly secrets set GITHUB_OAUTH_TOKEN=your_token
   fly secrets set GITHUB_WEBHOOK_SECRET=your_secret
   fly secrets set JIRA_BASE_URL=https://your-domain.atlassian.net
   fly secrets set JIRA_EMAIL=your_email
   fly secrets set JIRA_API_TOKEN=your_token
   fly secrets set JIRA_WEBHOOK_SECRET=your_secret
   fly secrets set REDIS_URL=your_redis_url
   fly secrets set NODE_ENV=production
   ```

6. **Deploy:**
   ```bash
   fly deploy
   ```

7. **Run migrations:**
   ```bash
   fly ssh console
   npm run db:migrate
   ```

8. **Deploy worker:**
   - Create a separate Fly app for the worker
   - Use the same codebase
   - Set command in fly.toml: `cmd = ["npm", "run", "worker"]`

## 🎨 Option 4: Render Deployment

### Steps

1. **Connect repository:**
   - Go to https://render.com
   - Connect your GitHub account
   - Select `github-jira-sync` repository

2. **Create PostgreSQL database:**
   - New → PostgreSQL
   - Name: `github-jira-sync-db`
   - Note the connection string

3. **Create Redis:**
   - New → Redis
   - Name: `github-jira-sync-redis`
   - Note the connection string

4. **Create Web Service:**
   - New → Web Service
   - Connect your repo
   - Settings:
     - Name: `github-jira-sync-api`
     - Environment: `Docker`
     - Dockerfile Path: `Dockerfile`
     - Health Check Path: `/health`

5. **Set environment variables:**
   ```
   DATABASE_URL=<from PostgreSQL>
   REDIS_URL=<from Redis>
   GITHUB_OAUTH_TOKEN=your_token
   GITHUB_WEBHOOK_SECRET=your_secret
   JIRA_BASE_URL=https://your-domain.atlassian.net
   JIRA_EMAIL=your_email
   JIRA_API_TOKEN=your_token
   JIRA_WEBHOOK_SECRET=your_secret
   NODE_ENV=production
   PORT=3000
   ```

6. **Create Background Worker:**
   - New → Background Worker
   - Same repo
   - Command: `npm run worker`
   - Same environment variables

7. **Deploy:**
   - Render will auto-deploy on git push
   - Or click "Manual Deploy"

8. **Run migrations:**
   - Use Render Shell or SSH
   ```bash
   npm run db:migrate
   ```

## 🔧 Post-Deployment Setup

### 1. Configure GitHub Webhook

1. Go to your GitHub repository
2. Settings → Webhooks → Add webhook
3. Configure:
   - **Payload URL:** `https://your-domain.com/webhook/github`
   - **Content type:** `application/json`
   - **Secret:** (use `GITHUB_WEBHOOK_SECRET` from your env)
   - **Events:** Select "Issues" and "Issue comments"
4. Save

### 2. Configure Jira Webhook

1. Go to Jira → Settings → System → Webhooks
2. Create webhook:
   - **Name:** GitHub Sync
   - **URL:** `https://your-domain.com/webhook/jira`
   - **Status:** Enabled
   - **Events:** 
     - Issue created
     - Issue updated
     - Comment created
3. Save

### 3. Create Sync Configuration

```bash
# Using API
curl -X POST https://your-domain.com/config \
  -H "Content-Type: application/json" \
  -d @config/example.yaml
```

Or use the CLI:
```bash
npm run sync:init
# Edit the config file
# Then load it via API
```

### 4. Test the Setup

```bash
# Test sync
curl -X POST https://your-domain.com/sync/test \
  -H "Content-Type: application/json" \
  -d '{
    "githubOwner": "your-org",
    "githubRepo": "your-repo",
    "githubIssueNumber": 1,
    "direction": "github_to_jira"
  }'
```

## 🔒 Security Best Practices

1. **Use HTTPS:** Required for webhooks
2. **Environment Variables:** Never commit secrets
3. **Webhook Secrets:** Always verify signatures
4. **Rate Limiting:** Consider adding rate limits
5. **Monitoring:** Set up error tracking (Sentry, etc.)
6. **Backups:** Regular database backups

## 📊 Monitoring & Health Checks

### Health Check Endpoint
```
GET https://your-domain.com/health
```

### Monitoring Setup

1. **Uptime Monitoring:**
   - UptimeRobot
   - Pingdom
   - StatusCake

2. **Error Tracking:**
   - Sentry
   - Rollbar
   - LogRocket

3. **Logs:**
   - Check platform logs (Railway/Fly.io/Render)
   - Set up log aggregation (Logtail, Papertrail)

## 🐛 Troubleshooting

### Webhooks not working
- Verify HTTPS is enabled
- Check webhook secret matches
- Review logs for errors
- Test webhook endpoint manually

### Database connection issues
- Verify DATABASE_URL is correct
- Check database is accessible
- Ensure migrations ran successfully

### Worker not processing jobs
- Verify Redis connection
- Check worker logs
- Ensure worker service is running
- Verify queue configuration

### Sync not working
- Check sync configuration exists
- Verify GitHub/Jira credentials
- Review sync logs
- Test with `/sync/test` endpoint

## 📝 Environment Variables Reference

```env
# Required
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
GITHUB_OAUTH_TOKEN=ghp_...
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your@email.com
JIRA_API_TOKEN=your_token

# Optional but recommended
GITHUB_WEBHOOK_SECRET=your_secret
JIRA_WEBHOOK_SECRET=your_secret
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
SYNC_PRIORITY=timestamp
```

## 🚀 Quick Deploy Commands

### Railway
```bash
railway up
railway run npm run db:migrate
```

### Fly.io
```bash
fly deploy
fly ssh console -C "npm run db:migrate"
```

### Render
- Auto-deploys on git push
- Or use manual deploy button

### Docker
```bash
docker-compose up -d
docker-compose exec api npm run db:migrate
```

## 📚 Next Steps

1. Deploy to your chosen platform
2. Configure webhooks
3. Create sync configuration
4. Test with a sample issue
5. Monitor and iterate!

Need help? Open an issue on GitHub! 🎉

