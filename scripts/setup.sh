#!/bin/bash

set -e

echo "🚀 Setting up GitHub ↔ Jira Sync..."

# Check if .env exists
if [ ! -f .env ]; then
  echo "📝 Creating .env file from .env.example..."
  cp .env.example .env
  echo "⚠️  Please edit .env with your credentials before continuing"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npm run db:generate

# Check if database is available
echo "🔍 Checking database connection..."
if docker-compose ps postgres | grep -q "Up"; then
  echo "✅ PostgreSQL is running"
else
  echo "🐘 Starting PostgreSQL..."
  docker-compose up -d postgres
  echo "⏳ Waiting for PostgreSQL to be ready..."
  sleep 5
fi

# Run migrations
echo "🗄️  Running database migrations..."
npm run db:migrate

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env with your GitHub and Jira credentials"
echo "2. Run 'npm run sync:init' to create a sync configuration"
echo "3. Start the API: 'npm run dev'"
echo "4. Start the worker: 'npm run worker' (in another terminal)"




