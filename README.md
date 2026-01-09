# Abacus

A web UI for managing [beads](https://github.com/steveyegge/beads) issues across GitHub repositories.

## What is Abacus?

Abacus lets you create, update, and manage beads issues through a web interface. It reads and writes directly to `.beads/issues.jsonl` files in your GitHub repositories via the GitHub API.

You can use Abacus alongside the `bd` CLI - both can edit the same issues without conflicts.

**Demo:** https://abacus.motleywoods.dev

## Features

- **Issue Management** - Create, edit, and close beads issues
- **Multiple Views** - List view, activity feed, and dashboard
- **Starring** - Star important issues for quick access
- **Bulk Updates** - Update status or priority on multiple issues at once
- **GitHub Integration** - Link issues to PRs and commits
- **Email Notifications** - Get notified when your issues change (see [docs/notifications.md](docs/notifications.md))
- **Executor Dispatch** - Trigger GitHub Actions workflows to work on issues (see [docs/executors.md](docs/executors.md))

## Quick Start

### Using the Demo

1. Go to https://abacus.motleywoods.dev
2. Sign in with GitHub
3. Add repositories you want to manage
4. Create and manage issues through the UI

### Self-Hosting

See [Deployment](#deployment) below.

## Prerequisites

- A GitHub account
- Repositories with beads initialized (`bd init`)
- For self-hosting: Cloudflare account (or see [src/server/README.md](src/server/README.md) for other platforms)

## Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Type check
npm run typecheck

# Build
npm run build
```

## Deployment

### Cloudflare Pages (Recommended)

```bash
npx wrangler pages deploy dist
```

Required secrets:
- `GITHUB_CLIENT_ID` - GitHub OAuth app client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth app client secret
- `SESSION_SECRET` - Random string for session encryption
- `RESEND_API_KEY` - (Optional) API key from [Resend](https://resend.com) for email notifications

### Other Platforms

Abacus includes an abstraction layer for running on other platforms. See [src/server/README.md](src/server/README.md) for instructions on deploying to Node.js, Docker, Fly.io, Railway, Vercel, or other hosting providers.

## Architecture

- **Frontend:** React + Vite
- **Backend:** Cloudflare Workers (Pages Functions)
- **Auth:** GitHub OAuth
- **Storage:**
  - Issues stored in GitHub repos (`.beads/issues.jsonl`)
  - User sessions in Cloudflare KV
  - User metadata in Cloudflare D1

## License

MIT
