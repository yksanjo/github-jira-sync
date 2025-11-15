# Contributing to GitHub ↔ Jira Sync

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## 🤝 How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/yksanjo/github-jira-sync/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node version, etc.)
   - Relevant logs or error messages

### Suggesting Features

1. Check existing [Issues](https://github.com/yksanjo/github-jira-sync/issues) and [Discussions](https://github.com/yksanjo/github-jira-sync/discussions)
2. Create a new issue with:
   - Clear description of the feature
   - Use case and motivation
   - Proposed implementation (if you have ideas)

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests if applicable
5. Ensure all tests pass (`npm test`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to your branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## 📋 Development Setup

1. **Fork and clone:**
   ```bash
   git clone https://github.com/your-username/github-jira-sync.git
   cd github-jira-sync
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Set up database:**
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

5. **Start services:**
   ```bash
   docker-compose up -d postgres redis
   ```

6. **Run tests:**
   ```bash
   npm test
   ```

## 🧪 Testing

- Write tests for new features
- Ensure all existing tests pass
- Aim for good test coverage
- Test edge cases and error scenarios

## 📝 Code Style

- Follow TypeScript best practices
- Use ESLint and Prettier (configured in project)
- Write clear, self-documenting code
- Add comments for complex logic
- Follow existing code patterns

## 📚 Documentation

- Update README if adding features
- Add JSDoc comments for public APIs
- Update examples if behavior changes
- Keep CHANGELOG.md updated

## 🏷️ Commit Messages

Follow conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

Example:
```
feat: add support for custom field mappings
fix: resolve infinite sync loop issue
docs: update quick start guide
```

## 🎯 Good First Issues

Look for issues labeled `good first issue` to get started!

## ❓ Questions?

- Open a [Discussion](https://github.com/yksanjo/github-jira-sync/discussions)
- Check existing [Issues](https://github.com/yksanjo/github-jira-sync/issues)
- Review the [README](./README.md) and [QUICKSTART](./QUICKSTART.md)

## 📜 Code of Conduct

Be respectful, inclusive, and constructive. We're all here to build something great together!

Thank you for contributing! 🎉

