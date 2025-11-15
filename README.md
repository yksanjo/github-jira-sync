# GitHub ↔ Jira Sync

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)
![Node.js](https://img.shields.io/badge/Node.js-20+-green)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)
![GitHub stars](https://img.shields.io/github/stars/yksanjo/github-jira-sync?style=social)

**A production-ready, open-source two-way sync tool between GitHub issues/PRs and Jira tasks**

Built with TypeScript, featuring smart mapping logic, resilient background workers, and an API-first architecture.

[Features](#-features) • [Quick Start](#-quick-start) • [Documentation](#-usage) • [Contributing](#-contributing)

[⭐ Star on GitHub](https://github.com/yksanjo/github-jira-sync) • [📖 Documentation](./README.md) • [🚀 Quick Start](./QUICKSTART.md) • [💬 Discussions](https://github.com/yksanjo/github-jira-sync/discussions)

</div>

## ✨ Features

- **Two-way Sync**: Automatic bidirectional synchronization between GitHub and Jira
- **Smart Mapping**: Configurable mappings for labels, statuses, users, and custom fields
- **Webhook + Queue Architecture**: Reliable event processing with BullMQ and Redis
- **Conflict Resolution**: Configurable sync priority (GitHub-first, Jira-first, or timestamp-based)
- **Deduplication**: Prevents infinite sync loops and duplicate updates
- **Resilient Workers**: Background job processing with retry logic and error handling
- **Type-Safe**: Full TypeScript support with Zod schema validation
- **Production Ready**: Docker support, deployment configs for Railway, Fly.io, and Render

## 🏗️ Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   GitHub    │────────▶│   Webhooks   │────────▶│    Queue    │
│  Webhooks   │         │   Handler    │         │   (BullMQ)  │
└─────────────┘         └──────────────┘         └─────────────┘
                                                         │
┌─────────────┐         ┌──────────────┐                │
│    Jira     │────────▶│   Webhooks   │                │
│  Webhooks   │         │   Handler    │                │
└─────────────┘         └──────────────┘                │
                                                         ▼
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  PostgreSQL │◀────────│  Sync Service│◀────────│   Worker    │
│  (Mappings) │         │   (Logic)    │         │  (Process)  │
└─────────────┘         └──────────────┘         └─────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- GitHub Personal Access Token or GitHub App
- Jira API Token

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd github-jira-sync

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Set up database
npm run db:generate
npm run db:migrate
```

### Configuration

1. **Create a sync configuration**:

```bash
npm run sync:init
# This creates a sync-config.yaml file
```

2. **Edit the configuration file** with your mappings:

```yaml
name: my-sync
github:
  owner: your-org
  repo: your-repo
jira:
  projectKey: PROJ
mappings:
  status:
    "To Do": "todo"
    "In Progress": "in_progress"
    "Done": "done"
```

3. **Load the configuration via API**:

```bash
curl -X POST http://localhost:3000/config \
  -H "Content-Type: application/json" \
  -d @sync-config.yaml
```

### Running Locally

```bash
# Start services with Docker Compose
docker-compose up -d

# Start the API server
npm run dev

# In another terminal, start the worker
npm run worker
```

### Testing

```bash
# Run unit tests
npm test

# Test a sync manually
npm run sync:test -- \
  --config sync-config.yaml \
  --github-owner your-org \
  --github-repo your-repo \
  --github-issue 123 \
  --direction github_to_jira
```

## 📖 Usage

### API Endpoints

#### Webhooks

- `POST /webhook/github` - Receive GitHub webhooks
- `POST /webhook/jira` - Receive Jira webhooks

#### Configuration

- `GET /config` - List all sync configurations
- `GET /config/:id` - Get a specific configuration
- `POST /config` - Create a new configuration
- `PUT /config/:id` - Update a configuration
- `DELETE /config/:id` - Delete a configuration

#### Sync

- `POST /sync/test` - Test a sync manually
- `GET /sync/status/:resourceId` - Get sync status (format: `owner/repo/123`)

### CLI Commands

```bash
# Initialize a new sync configuration
npm run sync:init

# Test a sync configuration
npm run sync:test -- --config config.yaml --github-issue 123

# Run the worker
npm run sync:run-worker
```

## 🔧 Configuration

### Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/github_jira_sync

# Redis
REDIS_URL=redis://localhost:6379

# GitHub
GITHUB_OAUTH_TOKEN=ghp_...
GITHUB_WEBHOOK_SECRET=your-webhook-secret

# Jira
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-api-token
JIRA_WEBHOOK_SECRET=your-webhook-secret

# Sync
SYNC_PRIORITY=timestamp  # github_first, jira_first, or timestamp
```

### Sync Configuration Schema

```typescript
{
  name: string;
  github: {
    owner: string;
    repo: string;
  };
  jira: {
    projectKey: string;
  };
  mappings: {
    status: Record<string, string>;  // GitHub label → Jira status
    users?: Record<string, string>;  // GitHub username → Jira account ID
    fields?: Record<string, string>; // Custom field mappings
    ignoreStatuses?: string[];
    ignoreLabels?: string[];
  };
  syncPriority: 'github_first' | 'jira_first' | 'timestamp';
  syncComments: boolean;
  syncLabels: boolean;
  syncAssignees: boolean;
}
```

## 🚢 Deployment

### Docker

```bash
docker build -t github-jira-sync .
docker run -p 3000:3000 --env-file .env github-jira-sync
```

### Railway

1. Connect your repository to Railway
2. Railway will automatically detect `railway.json`
3. Set environment variables in Railway dashboard
4. Deploy!

### Fly.io

```bash
fly launch
# Follow the prompts, Fly.io will use fly.toml
```

### Render

1. Create a new Web Service
2. Connect your repository
3. Render will use `render.yaml` for configuration
4. Set environment variables in the dashboard

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## 📝 How It Works

### Sync Flow

1. **Webhook Received**: GitHub or Jira sends a webhook to the API
2. **Event Validation**: Webhook signature is verified
3. **Job Creation**: A sync job is added to the queue with deduplication
4. **Worker Processing**: Background worker picks up the job
5. **Sync Execution**: 
   - Acquires lock to prevent concurrent syncs
   - Checks conflict resolution rules
   - Performs the sync operation
   - Updates mapping in database
   - Releases lock
6. **Result Logging**: Success or failure is logged

### Conflict Resolution

The sync service supports three conflict resolution strategies:

- **`github_first`**: GitHub changes always take precedence
- **`jira_first`**: Jira changes always take precedence
- **`timestamp`**: The most recent update wins (default)

### Deduplication

- Jobs are deduplicated by a unique ID based on direction, event type, and resource
- Locks prevent concurrent syncs on the same resource
- Event IDs are stored to prevent reprocessing

## 🔒 Security

- Webhook signature verification for GitHub and Jira
- Environment variable-based secrets management
- Database connection pooling
- Rate limiting on API endpoints (via BullMQ)
- Input validation with Zod schemas

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

Inspired by:
- [Octosync](https://github.com/octosync/octosync) - Simple GitHub-Jira sync
- [Unito](https://unito.io/) - Enterprise sync platform
- [Exalate](https://exalate.com/) - Powerful integration tool

## 🐛 Troubleshooting

### Common Issues

**Issue**: Webhooks not being received
- Check webhook URL is accessible
- Verify webhook secret matches
- Check logs for signature verification errors

**Issue**: Sync loops
- Ensure `ignoreStatuses` and `ignoreLabels` are configured
- Check sync priority settings
- Verify lock mechanism is working

**Issue**: Jobs stuck in queue
- Check Redis connection
- Verify worker is running
- Check for error logs

## 📚 Additional Resources

- [GitHub Webhooks Documentation](https://docs.github.com/en/webhooks)
- [Jira Webhooks Documentation](https://developer.atlassian.com/cloud/jira/platform/webhooks/)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Prisma Documentation](https://www.prisma.io/docs)

---

Built with ❤️ using TypeScript, Fastify, BullMQ, and Prisma

