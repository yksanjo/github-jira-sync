# Real-World Usage Examples

## Quick Start

### 1. Environment Setup

```bash
# Clone and install
git clone https://github.com/your-org/github-jira-sync.git
cd github-jira-sync

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
```

### 2. Configure Webhooks

#### GitHub Webhook Setup

1. Go to your repository **Settings** → **Webhooks**
2. Add new webhook:
   - **Payload URL**: `https://your-domain.com/webhooks/github`
   - **Content type**: `application/json`
   - **Events**: Select "Let me select individual events" and check:
     - Issues
     - Issue comments
   - **Secret**: Copy from `GITHUB_WEBHOOK_SECRET`

#### Jira Webhook Setup

1. Go to **Jira Settings** → **System** → **Webhooks**
2. Create new webhook:
   - **Name**: GitHub Sync
   - **URL**: `https://your-domain.com/webhooks/jira`
   - **Events**: 
     - Issue created
     - Issue updated
     - Issue deleted
     - Comment created
     - Comment updated

## Usage Scenarios

### Scenario 1: Development Team Using GitHub Issues

**Setup:**
```env
GITHUB_ORG=mycompany
GITHUB_REPO=backend-api
JIRA_PROJECT_KEY=BACK
SYNC_CONFLICT_RESOLUTION=LAST_WRITE_WINS
```

**Workflow:**
1. Developer creates GitHub issue
2. Webhook triggers → Sync to Jira
3. Team works in Jira
4. Status changes sync back to GitHub

### Scenario 2: Enterprise with Jira as Source of Truth

**Setup:**
```env
GITHUB_ORG=mycompany
GITHUB_REPO=frontend-app
JIRA_PROJECT_KEY=FE
SYNC_CONFLICT_RESOLUTION=JIRA_WINS
```

**Configuration:**
- Use `LAST_WRITE_WINS` for bidirectional sync
- Use `JIRA_WINS` when Jira is authoritative
- Use `GITHUB_WINS` when GitHub is authoritative
- Use `MANUAL` for sensitive fields

### Scenario 3: Custom Label Mapping

**Setup:**
```typescript
// Custom mapping configuration
const labelMapping = {
  'bug': 'bug',
  'enhancement': 'improvement',
  'help wanted': 'question',
  'good first issue': 'beginner',
};

const statusMapping = {
  'open': 'To Do',
  'in progress': 'In Progress',
  'in review': 'In Review',
  'closed': 'Done',
};
```

### Scenario 4: Selective Sync

Only sync specific labels:
```typescript
const LABEL_FILTER = ['bug', 'feature', 'enhancement'];

// In sync-engine.ts
if (!shouldSync(githubIssue.labels, LABEL_FILTER)) {
  return { success: true, sourceId, skipped: true };
}
```

## API Usage

### Manual Sync Trigger

```bash
# Sync specific GitHub issue to Jira
curl -X POST https://your-domain.com/api/sync/github/42

# Sync specific Jira issue to GitHub  
curl -X POST https://your-domain.com/api/sync/jira/PROJECT-123
```

### Check Queue Status

```bash
curl https://your-domain.com/api/queues
```

Response:
```json
{
  "github-sync": {
    "waiting": 0,
    "active": 2,
    "completed": 150,
    "failed": 3
  },
  "jira-sync": {
    "waiting": 1,
    "active": 1,
    "completed": 145,
    "failed": 2
  }
}
```

## Production Deployment

### Docker Compose (Development)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

### Kubernetes (Production)

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: github-jira-sync
spec:
  replicas: 3
  selector:
    matchLabels:
      app: github-jira-sync
  template:
    metadata:
      labels:
        app: github-jira-sync
    spec:
      containers:
      - name: app
        image: your-registry/github-jira-sync:v1.0.0
        ports:
        - containerPort: 3000
        env:
        - name: REDIS_HOST
          valueFrom:
            secretKeyRef:
              name: github-jira-sync-secrets
              key: redis-host
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
```

## Monitoring

### Grafana Dashboard

Import the provided dashboard for:
- Sync throughput (issues/min)
- Error rates
- Queue depth
- Processing latency
- Conflict detection rate

### Alerting

Set up alerts for:
- Queue depth > 1000
- Error rate > 1%
- Processing latency > 5s
- Failed jobs > 10 in 5 minutes

## Troubleshooting

### Common Issues

1. **Webhook not triggering**
   - Check webhook URL is publicly accessible
   - Verify secret matches
   - Check logs: `docker-compose logs app`

2. **Sync not happening**
   - Check queue: `/api/queues`
   - Check for conflicts
   - Verify API credentials

3. **Rate limiting**
   - GitHub: 5000 requests/hour
   - Jira: Depends on plan
   - Implement exponential backoff

### Debug Mode

```env
LOG_LEVEL=debug
NODE_ENV=development
```
