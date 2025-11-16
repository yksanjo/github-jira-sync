# ⚡ Quick Deploy Guide

Fastest way to get your sync tool running in production.

## 🎯 Choose Your Platform

### 🚂 Railway (Easiest - Recommended)

**Time: ~10 minutes**

1. **Sign up:** https://railway.app
2. **New Project → Deploy from GitHub**
3. **Select your repo:** `yksanjo/github-jira-sync`
4. **Add PostgreSQL:**
   - Click "+ New" → Database → PostgreSQL
   - Railway auto-sets `DATABASE_URL`
5. **Add Redis:**
   - Click "+ New" → Database → Redis
   - Railway auto-sets `REDIS_URL`
6. **Set environment variables:**
   ```
   GITHUB_OAUTH_TOKEN=ghp_your_token
   GITHUB_WEBHOOK_SECRET=your_secret
   JIRA_BASE_URL=https://your-domain.atlassian.net
   JIRA_EMAIL=your@email.com
   JIRA_API_TOKEN=your_token
   JIRA_WEBHOOK_SECRET=your_secret
   NODE_ENV=production
   ```
7. **Deploy:** Railway auto-deploys
8. **Run migrations:**
   - Click on your service → Deployments → Latest
   - Open shell/console
   - Run: `npm run db:migrate`
9. **Get your URL:** Railway provides `https://your-app.railway.app`
10. **Deploy worker:**
    - Click "+ New" → Background Worker
    - Same repo
    - Command: `npm run worker`
    - Same environment variables

**Done!** Your URL: `https://your-app.railway.app`

---

### ✈️ Fly.io (Fast & Global)

**Time: ~15 minutes**

```bash
# 1. Install CLI
curl -L https://fly.io/install.sh | sh

# 2. Login
fly auth login

# 3. Launch (uses existing fly.toml)
fly launch

# 4. Create database
fly postgres create --name github-jira-sync-db
fly postgres attach --app github-jira-sync github-jira-sync-db

# 5. Create Redis
fly redis create
# Copy the connection URL

# 6. Set secrets
fly secrets set GITHUB_OAUTH_TOKEN=your_token
fly secrets set GITHUB_WEBHOOK_SECRET=your_secret
fly secrets set JIRA_BASE_URL=https://your-domain.atlassian.net
fly secrets set JIRA_EMAIL=your@email.com
fly secrets set JIRA_API_TOKEN=your_token
fly secrets set JIRA_WEBHOOK_SECRET=your_secret
fly secrets set REDIS_URL=your_redis_url

# 7. Deploy
fly deploy

# 8. Run migrations
fly ssh console -C "npm run db:migrate"
```

**Done!** Your URL: `https://your-app.fly.dev`

---

### 🎨 Render (Simple & Reliable)

**Time: ~15 minutes**

1. **Sign up:** https://render.com
2. **New → PostgreSQL:**
   - Name: `github-jira-sync-db`
   - Copy connection string
3. **New → Redis:**
   - Name: `github-jira-sync-redis`
   - Copy connection string
4. **New → Web Service:**
   - Connect GitHub repo
   - Name: `github-jira-sync-api`
   - Environment: `Docker`
   - Build Command: (auto-detected)
   - Start Command: `npm start`
   - Environment Variables:
     ```
     DATABASE_URL=<from PostgreSQL>
     REDIS_URL=<from Redis>
     GITHUB_OAUTH_TOKEN=your_token
     GITHUB_WEBHOOK_SECRET=your_secret
     JIRA_BASE_URL=https://your-domain.atlassian.net
     JIRA_EMAIL=your@email.com
     JIRA_API_TOKEN=your_token
     JIRA_WEBHOOK_SECRET=your_secret
     NODE_ENV=production
     ```
5. **Create → Deploy**
6. **Run migrations:**
   - Go to Shell
   - Run: `npm run db:migrate`
7. **New → Background Worker:**
   - Same repo
   - Command: `npm run worker`
   - Same environment variables

**Done!** Your URL: `https://github-jira-sync-api.onrender.com`

---

## 🔧 After Deployment

### 1. Get Your Webhook URL

- Railway: `https://your-app.railway.app`
- Fly.io: `https://your-app.fly.dev`
- Render: `https://your-app.onrender.com`

### 2. Configure GitHub Webhook

1. Go to your repo → Settings → Webhooks
2. Add webhook:
   - URL: `https://your-url/webhook/github`
   - Secret: (use `GITHUB_WEBHOOK_SECRET`)
   - Events: Issues, Issue comments
3. Save

### 3. Configure Jira Webhook

1. Jira → Settings → System → Webhooks
2. Create webhook:
   - URL: `https://your-url/webhook/jira`
   - Events: Issue created, updated, comment created
3. Save

### 4. Create Sync Config

```bash
# Via API
curl -X POST https://your-url/config \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-sync",
    "github": {
      "owner": "your-org",
      "repo": "your-repo"
    },
    "jira": {
      "projectKey": "PROJ"
    },
    "mappings": {
      "status": {
        "To Do": "todo",
        "In Progress": "in_progress",
        "Done": "done"
      }
    }
  }'
```

### 5. Test It!

Create a test issue in GitHub and watch it sync to Jira! 🎉

---

## 🆘 Troubleshooting

**Webhook not receiving events?**
- Check HTTPS is enabled (required)
- Verify webhook secret matches
- Check logs: `railway logs` or `fly logs`

**Database errors?**
- Verify `DATABASE_URL` is set
- Run migrations: `npm run db:migrate`

**Worker not processing?**
- Check `REDIS_URL` is set
- Verify worker service is running
- Check worker logs

**Need help?** Open an issue on GitHub!

---

## 📊 Recommended: Railway

**Why Railway?**
- ✅ Easiest setup
- ✅ Auto-detects services
- ✅ Free tier available
- ✅ Great developer experience
- ✅ Built-in PostgreSQL & Redis

**Get started:** https://railway.app/new

---

That's it! You're live! 🚀

