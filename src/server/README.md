# Abacus Server - Portable Backend

This directory contains a portable backend implementation for Abacus that can run on multiple platforms.

## Architecture

```
src/server/
├── interfaces/          # Abstract interfaces
│   ├── database.ts      # Database operations interface
│   ├── session-store.ts # Session/KV operations interface
│   └── crypto.ts        # Encryption/hashing interface
├── adapters/            # Platform-specific implementations
│   ├── d1-database.ts   # Cloudflare D1 adapter
│   ├── kv-session-store.ts    # Cloudflare KV adapter
│   ├── sqlite-database.ts     # Generic SQLite adapter
│   ├── memory-session-store.ts # In-memory sessions
│   └── web-crypto.ts    # Web Crypto API (universal)
├── app.ts               # Unified Hono application
└── standalone.ts        # Example Node.js entry point
```

## Supported Platforms

### Currently Working
- **Cloudflare Workers/Pages** - Uses D1 + KV (current deployment)

### Easy to Add
- **Node.js** - Use `better-sqlite3` + `MemorySessionStore` or Redis
- **Bun** - Native SQLite support + Memory/Redis sessions
- **Deno** - Use `deno-sqlite` + KV or Memory sessions
- **Docker** - Any of the above with SQLite file or PostgreSQL

## Running Standalone (Non-Cloudflare)

### Prerequisites

1. Node.js 18+ (or Bun/Deno)
2. A GitHub OAuth App

### Setup

1. **Install dependencies:**
   ```bash
   npm install better-sqlite3 @hono/node-server
   npm install -D @types/better-sqlite3
   ```

2. **Create GitHub OAuth App:**
   - Go to https://github.com/settings/developers
   - Create new OAuth App
   - Set Authorization callback URL to `http://localhost:3000/api/auth/callback`

3. **Set environment variables:**
   ```bash
   export GITHUB_CLIENT_ID=your_client_id
   export GITHUB_CLIENT_SECRET=your_client_secret
   export TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)
   export BASE_URL=http://localhost:3000
   ```

4. **Build the frontend:**
   ```bash
   npm run build
   ```

5. **Run the server:**
   ```bash
   npx tsx src/server/standalone.ts
   ```

## Creating Custom Adapters

### Database Adapter

Implement the `Database` interface from `interfaces/database.ts`:

```typescript
import type { Database, User, Repo } from './interfaces/database'

export class MyDatabase implements Database {
  async getUserById(id: number): Promise<User | null> {
    // Your implementation
  }
  // ... implement all methods
}
```

### Session Store Adapter

Implement the `SessionStore` interface from `interfaces/session-store.ts`:

```typescript
import type { SessionStore, SessionData } from './interfaces/session-store'

export class RedisSessionStore implements SessionStore {
  constructor(private redis: RedisClient) {}

  async getSession(token: string): Promise<SessionData | null> {
    const data = await this.redis.get(`session:${token}`)
    return data ? JSON.parse(data) : null
  }
  // ... implement all methods
}
```

## Example: PostgreSQL Adapter

```typescript
import type { Database, User } from './interfaces/database'
import { Pool } from 'pg'

export class PostgresDatabase implements Database {
  constructor(private pool: Pool) {}

  async getUserById(id: number): Promise<User | null> {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    )
    return result.rows[0] || null
  }

  async initialize(): Promise<void> {
    // Run migrations
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        github_id INTEGER NOT NULL UNIQUE,
        -- ... rest of schema
      )
    `)
  }
  // ... implement all methods
}
```

## Example: Redis Session Store

```typescript
import type { SessionStore, SessionData } from './interfaces/session-store'
import { Redis } from 'ioredis'

export class RedisSessionStore implements SessionStore {
  constructor(private redis: Redis) {}

  async getSession(token: string): Promise<SessionData | null> {
    const data = await this.redis.get(`session:${token}`)
    return data ? JSON.parse(data) : null
  }

  async createSession(token: string, data: SessionData, ttlSeconds: number): Promise<void> {
    await this.redis.setex(`session:${token}`, ttlSeconds, JSON.stringify(data))
  }

  async deleteSession(token: string): Promise<void> {
    await this.redis.del(`session:${token}`)
  }

  async checkRateLimit(key: string, maxRequests: number, windowSeconds: number): Promise<{
    allowed: boolean
    remaining: number
    resetAt: number
  }> {
    const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds
    const rateLimitKey = `ratelimit:${key}:${windowStart}`

    const count = await this.redis.incr(rateLimitKey)
    if (count === 1) {
      await this.redis.expire(rateLimitKey, windowSeconds * 2)
    }

    const allowed = count <= maxRequests
    return {
      allowed,
      remaining: Math.max(0, maxRequests - count),
      resetAt: windowStart + windowSeconds,
    }
  }
  // ... implement remaining methods
}
```

## Deployment Options

### Fly.io
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
CMD ["npx", "tsx", "src/server/standalone.ts"]
```

### Railway
- Connect your repo
- Set environment variables
- Railway auto-detects Node.js

### Vercel
Use the Edge runtime with the Hono app:
```typescript
import { handle } from 'hono/vercel'
export const runtime = 'edge'
export default handle(app)
```

### Docker Compose
```yaml
version: '3.8'
services:
  abacus:
    build: .
    ports:
      - "3000:3000"
    environment:
      - GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
      - GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
      - TOKEN_ENCRYPTION_KEY=${TOKEN_ENCRYPTION_KEY}
      - BASE_URL=http://localhost:3000
    volumes:
      - ./data:/app/data  # For SQLite persistence
```

## Missing Features (vs Cloudflare version)

The standalone version currently doesn't include:
- Issue CRUD (reads from GitHub API via existing functions/)
- Webhook handling
- Email notifications

These can be added by porting the remaining routes from `functions/api/`.
