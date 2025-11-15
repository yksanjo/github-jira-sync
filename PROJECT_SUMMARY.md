# GitHub ↔ Jira Sync - Project Summary

## Overview

A production-ready, open-source two-way synchronization tool between GitHub issues/PRs and Jira tasks. Built with TypeScript, featuring smart mapping logic, resilient background workers, and an API-first architecture.

## Project Structure

```
github-jira-sync/
├── src/
│   ├── modules/
│   │   ├── github/          # GitHub API client
│   │   ├── jira/            # Jira API client
│   │   ├── mapping/         # Mapping engine for labels/statuses/users
│   │   ├── queue/           # BullMQ queue management
│   │   └── sync/            # Core sync service with conflict resolution
│   ├── routes/              # Fastify API routes
│   │   ├── webhooks.ts      # Webhook endpoints
│   │   ├── sync.ts          # Sync test endpoints
│   │   └── config.ts        # Configuration management
│   ├── webhooks/            # Webhook handlers
│   │   ├── github.ts        # GitHub webhook processing
│   │   └── jira.ts          # Jira webhook processing
│   ├── workers/             # Background job workers
│   │   └── index.ts         # Sync job processor
│   ├── cli/                 # CLI tool
│   │   ├── index.ts         # CLI entry point
│   │   ├── init.ts          # Initialize config
│   │   └── test.ts          # Test sync
│   ├── db/                  # Database client
│   ├── config/              # Configuration management
│   ├── types/               # TypeScript type definitions
│   └── utils/               # Utility functions
├── prisma/                  # Prisma schema
├── config/                  # Example configurations
├── scripts/                 # Setup scripts
├── tests/                   # Test files
└── dist/                    # Compiled output
```

## Key Features

### ✅ Core Functionality

- **Two-way Sync**: Automatic bidirectional synchronization
- **Smart Mapping**: Configurable mappings for labels ↔ statuses, users, custom fields
- **Webhook + Queue**: Reliable event processing with BullMQ
- **Conflict Resolution**: Three strategies (GitHub-first, Jira-first, timestamp-based)
- **Deduplication**: Prevents infinite loops and duplicate updates
- **Locking Mechanism**: Prevents concurrent syncs on same resource

### ✅ Technical Features

- **Type-Safe**: Full TypeScript with Zod validation
- **Resilient**: Retry logic, error handling, graceful degradation
- **Scalable**: Queue-based architecture, horizontal scaling support
- **Observable**: Structured logging with Pino
- **Testable**: Unit and integration tests with Vitest

### ✅ Production Ready

- **Docker Support**: Dockerfile and docker-compose
- **Deployment Configs**: Railway, Fly.io, Render
- **Database Migrations**: Prisma migrations
- **Health Checks**: Built-in health endpoints
- **Security**: Webhook signature verification

## Architecture

### Data Flow

1. **Webhook Reception**: GitHub/Jira sends webhook → API validates signature
2. **Job Creation**: Event → Queue (with deduplication)
3. **Worker Processing**: Queue → Worker → Sync Service
4. **Sync Execution**: 
   - Acquire lock
   - Check conflict resolution
   - Perform sync
   - Update mapping
   - Release lock
5. **Result**: Success/failure logged

### Database Schema

- **SyncMapping**: Links GitHub issues to Jira issues
- **SyncEvent**: Tracks processed events (deduplication)
- **SyncConfig**: Stores sync configurations
- **SyncLock**: Prevents concurrent syncs

### Queue System

- **BullMQ**: Job queue with Redis backend
- **Deduplication**: Job IDs prevent duplicates
- **Retry Logic**: Exponential backoff on failures
- **Concurrency**: Configurable worker concurrency

## API Endpoints

### Webhooks
- `POST /webhook/github` - GitHub webhook receiver
- `POST /webhook/jira` - Jira webhook receiver

### Configuration
- `GET /config` - List configurations
- `GET /config/:id` - Get configuration
- `POST /config` - Create configuration
- `PUT /config/:id` - Update configuration
- `DELETE /config/:id` - Delete configuration

### Sync
- `POST /sync/test` - Test sync manually
- `GET /sync/status/:resourceId` - Get sync status

## Configuration

### Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `GITHUB_OAUTH_TOKEN` - GitHub authentication
- `JIRA_BASE_URL` - Jira instance URL
- `JIRA_EMAIL` - Jira user email
- `JIRA_API_TOKEN` - Jira API token

Optional:
- `PORT` - Server port (default: 3000)
- `LOG_LEVEL` - Logging level (default: info)
- `SYNC_PRIORITY` - Conflict resolution (default: timestamp)

### Sync Configuration

YAML/JSON format with:
- GitHub repository mapping
- Jira project mapping
- Status/label mappings
- User mappings
- Field mappings
- Ignore rules
- Sync preferences

## Testing

- **Unit Tests**: Vitest for individual modules
- **Integration Tests**: End-to-end sync testing
- **Mocking**: GitHub/Jira API mocks
- **Coverage**: Coverage reports with Vitest

## Deployment

### Local Development
```bash
docker-compose up -d
npm run dev
npm run worker
```

### Production
- **Railway**: Uses `railway.json`
- **Fly.io**: Uses `fly.toml`
- **Render**: Uses `render.yaml`
- **Docker**: Standard Dockerfile

## Security

- Webhook signature verification
- Environment variable secrets
- Database connection pooling
- Rate limiting (via BullMQ)
- Input validation (Zod schemas)

## Performance

- **Queue-based**: Non-blocking webhook processing
- **Concurrent Workers**: Configurable parallelism
- **Deduplication**: Prevents redundant work
- **Locking**: Prevents race conditions
- **Caching**: Redis for job state

## Monitoring

- Structured logging (Pino)
- Health check endpoint
- Queue metrics (BullMQ)
- Error tracking
- Job status tracking

## Future Enhancements

Potential improvements:
- Web UI for configuration
- Advanced field mapping UI
- Sync history/audit log
- Webhook replay functionality
- Multi-project support
- Custom webhook filters
- Rate limit handling
- Batch sync operations

## Dependencies

### Core
- Fastify - Web framework
- Prisma - Database ORM
- BullMQ - Job queue
- Redis - Queue backend
- PostgreSQL - Database
- Octokit - GitHub API
- Zod - Schema validation

### Development
- TypeScript - Type safety
- Vitest - Testing
- ESLint - Linting
- Prettier - Formatting

## License

MIT License

## Credits

Inspired by:
- Octosync (simple GitHub-Jira sync)
- Unito (enterprise sync platform)
- Exalate (powerful integration tool)

