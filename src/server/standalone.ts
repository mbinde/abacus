// Standalone Node.js server entry point
// Run with: npx tsx src/server/standalone.ts
//
// This is an example of running Abacus outside of Cloudflare.
// You'll need to:
// 1. Install dependencies: npm install better-sqlite3 @types/better-sqlite3
// 2. Set environment variables (see below)
// 3. Run: npx tsx src/server/standalone.ts

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createApp, type AppConfig, type AppContext } from './app'
import { SQLiteDatabase, type SQLiteDriver } from './adapters/sqlite-database'
import { MemorySessionStore } from './adapters/memory-session-store'
import { WebCryptoProvider } from './adapters/web-crypto'

// Example using better-sqlite3 (you'll need to install it)
// import Database from 'better-sqlite3'

async function main() {
  // Configuration from environment
  const config: AppConfig = {
    githubClientId: process.env.GITHUB_CLIENT_ID!,
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET!,
    tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY!,
    resendApiKey: process.env.RESEND_API_KEY,
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  }

  // Validate required config
  if (!config.githubClientId || !config.githubClientSecret || !config.tokenEncryptionKey) {
    console.error('Missing required environment variables:')
    console.error('  GITHUB_CLIENT_ID')
    console.error('  GITHUB_CLIENT_SECRET')
    console.error('  TOKEN_ENCRYPTION_KEY (64 hex chars for AES-256)')
    process.exit(1)
  }

  // Initialize database
  // Example with better-sqlite3:
  // const sqliteDb = new Database('./abacus.db')
  // const driver: SQLiteDriver = {
  //   run: (sql, params) => sqliteDb.prepare(sql).run(...(params || [])),
  //   get: (sql, params) => sqliteDb.prepare(sql).get(...(params || [])),
  //   all: (sql, params) => sqliteDb.prepare(sql).all(...(params || [])),
  // }
  // const db = new SQLiteDatabase(driver)

  // For now, just show how it would work
  console.log('='.repeat(60))
  console.log('Abacus Standalone Server')
  console.log('='.repeat(60))
  console.log('')
  console.log('To run this server, you need to:')
  console.log('')
  console.log('1. Install better-sqlite3:')
  console.log('   npm install better-sqlite3 @types/better-sqlite3')
  console.log('')
  console.log('2. Uncomment the database initialization code above')
  console.log('')
  console.log('3. Set environment variables:')
  console.log('   export GITHUB_CLIENT_ID=your_client_id')
  console.log('   export GITHUB_CLIENT_SECRET=your_client_secret')
  console.log('   export TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)')
  console.log('   export BASE_URL=http://localhost:3000')
  console.log('')
  console.log('4. Create a GitHub OAuth App at:')
  console.log('   https://github.com/settings/developers')
  console.log('   Set callback URL to: http://localhost:3000/api/auth/callback')
  console.log('')
  console.log('='.repeat(60))

  // Placeholder - uncomment the real implementation above
  const db = null as any
  if (!db) {
    console.log('')
    console.log('Exiting - please follow the setup instructions above.')
    process.exit(0)
  }

  await db.initialize()

  // Initialize session store (in-memory for development)
  const sessions = new MemorySessionStore()

  // Initialize crypto provider
  const crypto = new WebCryptoProvider()

  // Create app context
  const context: AppContext = { db, sessions, crypto, config }

  // Create Hono app
  const app = createApp(context)

  // Serve static files from dist/
  app.use('/*', serveStatic({ root: './dist' }))

  // Fallback to index.html for SPA routing
  app.get('*', serveStatic({ path: './dist/index.html' }))

  // Start server
  const port = parseInt(process.env.PORT || '3000')
  console.log(`Server running at http://localhost:${port}`)

  serve({
    fetch: app.fetch,
    port,
  })
}

main().catch(console.error)
