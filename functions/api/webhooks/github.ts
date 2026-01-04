// /api/webhooks/github - Handle GitHub webhook events for issue change notifications

import { decryptToken } from '../../lib/crypto'

interface Env {
  DB: D1Database
  GITHUB_WEBHOOK_SECRET: string
  RESEND_API_KEY: string
  TOKEN_ENCRYPTION_KEY: string
}

interface PushEvent {
  ref: string
  repository: {
    full_name: string
    owner: { login: string }
    name: string
  }
  commits: Array<{
    id: string
    modified: string[]
    added: string[]
  }>
  head_commit: {
    id: string
  } | null
}

interface BeadsIssue {
  id: string
  title: string
  status: 'open' | 'closed' | 'in_progress'
  assignee?: string
  created_by?: string
  updated_at?: string
}

interface WebhookState {
  issues_hash: string
  issues_snapshot: string
}

interface UserWithEmail {
  id: number
  github_login: string
  email: string
  email_notifications: number
}

// Verify GitHub webhook signature
async function verifySignature(
  payload: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const expectedSignature = 'sha256=' + Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  return signature === expectedSignature
}

// Simple hash for comparing issue states
function hashIssues(issues: BeadsIssue[]): string {
  const sorted = [...issues].sort((a, b) => a.id.localeCompare(b.id))
  return JSON.stringify(sorted)
}

// Detect changes between old and new issue states
function detectChanges(
  oldIssues: BeadsIssue[],
  newIssues: BeadsIssue[]
): Array<{ issue: BeadsIssue; changeType: 'created' | 'updated' | 'closed'; oldIssue?: BeadsIssue }> {
  const changes: Array<{ issue: BeadsIssue; changeType: 'created' | 'updated' | 'closed'; oldIssue?: BeadsIssue }> = []
  const oldMap = new Map(oldIssues.map(i => [i.id, i]))

  // Check for new and updated issues
  for (const issue of newIssues) {
    const oldIssue = oldMap.get(issue.id)
    if (!oldIssue) {
      changes.push({ issue, changeType: 'created' })
    } else if (JSON.stringify(oldIssue) !== JSON.stringify(issue)) {
      if (issue.status === 'closed' && oldIssue.status !== 'closed') {
        changes.push({ issue, changeType: 'closed', oldIssue })
      } else {
        changes.push({ issue, changeType: 'updated', oldIssue })
      }
    }
  }

  return changes
}

// Send email via Resend
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  apiKey: string
): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Abacus <notifications@abacus.dev>',
        to: [to],
        subject,
        html,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

// Format email for issue change
function formatEmail(
  repoFullName: string,
  issue: BeadsIssue,
  changeType: 'created' | 'updated' | 'closed',
  oldIssue?: BeadsIssue
): { subject: string; html: string } {
  const statusEmoji = {
    open: '🟢',
    in_progress: '🔵',
    closed: '⚫',
  }

  let subject: string
  let changeDescription: string

  switch (changeType) {
    case 'created':
      subject = `[${repoFullName}] New issue: ${issue.title}`
      changeDescription = `A new issue was created.`
      break
    case 'closed':
      subject = `[${repoFullName}] Issue closed: ${issue.title}`
      changeDescription = `Issue was closed.`
      break
    case 'updated':
      subject = `[${repoFullName}] Issue updated: ${issue.title}`
      const changes: string[] = []
      if (oldIssue) {
        if (oldIssue.status !== issue.status) {
          changes.push(`Status: ${oldIssue.status} → ${issue.status}`)
        }
        if (oldIssue.assignee !== issue.assignee) {
          changes.push(`Assignee: ${oldIssue.assignee || 'unassigned'} → ${issue.assignee || 'unassigned'}`)
        }
        if (oldIssue.title !== issue.title) {
          changes.push(`Title changed`)
        }
      }
      changeDescription = changes.length > 0 ? changes.join('<br>') : 'Issue details were updated.'
      break
  }

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">${statusEmoji[issue.status]} ${issue.title}</h2>
      <p style="color: #666;">${changeDescription}</p>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; background: #f8f9fa;"><strong>Repository</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${repoFullName}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; background: #f8f9fa;"><strong>Issue ID</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${issue.id}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; background: #f8f9fa;"><strong>Status</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${issue.status}</td>
        </tr>
        ${issue.assignee ? `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; background: #f8f9fa;"><strong>Assignee</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">@${issue.assignee}</td>
        </tr>
        ` : ''}
      </table>
      <p style="color: #999; font-size: 12px;">
        You received this because you have email notifications enabled in Abacus.
      </p>
    </div>
  `

  return { subject, html }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  // Verify webhook signature
  const signature = request.headers.get('X-Hub-Signature-256')
  const payload = await request.text()

  if (!env.GITHUB_WEBHOOK_SECRET) {
    console.error('GITHUB_WEBHOOK_SECRET not configured')
    return new Response('Webhook secret not configured', { status: 500 })
  }

  const isValid = await verifySignature(payload, signature, env.GITHUB_WEBHOOK_SECRET)
  if (!isValid) {
    return new Response('Invalid signature', { status: 401 })
  }

  // Only handle push events
  const event = request.headers.get('X-GitHub-Event')
  if (event !== 'push') {
    return new Response('OK', { status: 200 })
  }

  const data = JSON.parse(payload) as PushEvent

  // Check if any commits modified .beads/issues.jsonl
  const beadsModified = data.commits.some(commit =>
    commit.modified.includes('.beads/issues.jsonl') ||
    commit.added.includes('.beads/issues.jsonl')
  )

  if (!beadsModified) {
    return new Response('OK', { status: 200 })
  }

  const repoOwner = data.repository.owner.login
  const repoName = data.repository.name
  const repoFullName = data.repository.full_name

  try {
    // Get previous state from database
    const prevState = await env.DB.prepare(
      'SELECT issues_hash, issues_snapshot FROM webhook_state WHERE repo_owner = ? AND repo_name = ?'
    ).bind(repoOwner, repoName).first() as WebhookState | null

    // Fetch current issues.jsonl from GitHub
    // We need a token - find a user who has this repo
    const repoUser = await env.DB.prepare(`
      SELECT u.github_token_encrypted
      FROM repos r
      JOIN users u ON r.user_id = u.id
      WHERE r.owner = ? AND r.name = ?
      LIMIT 1
    `).bind(repoOwner, repoName).first() as { github_token_encrypted: string } | null

    if (!repoUser) {
      // No user tracking this repo, nothing to do
      return new Response('OK', { status: 200 })
    }

    const token = await decryptToken(repoUser.github_token_encrypted, env.TOKEN_ENCRYPTION_KEY)

    const issuesRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/contents/.beads/issues.jsonl`,
      {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'abacus',
        },
      }
    )

    if (!issuesRes.ok) {
      return new Response('OK', { status: 200 })
    }

    const issuesData = await issuesRes.json() as { content: string }
    const issuesContent = atob(issuesData.content.replace(/\n/g, ''))
    const currentIssues: BeadsIssue[] = issuesContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line))

    const currentHash = hashIssues(currentIssues)

    // If no previous state, just save current and exit
    if (!prevState) {
      await env.DB.prepare(`
        INSERT INTO webhook_state (repo_owner, repo_name, issues_hash, issues_snapshot, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).bind(repoOwner, repoName, currentHash, JSON.stringify(currentIssues)).run()
      return new Response('OK', { status: 200 })
    }

    // If hash unchanged, nothing to do
    if (prevState.issues_hash === currentHash) {
      return new Response('OK', { status: 200 })
    }

    // Detect changes
    const oldIssues: BeadsIssue[] = JSON.parse(prevState.issues_snapshot)
    const changes = detectChanges(oldIssues, currentIssues)

    if (changes.length === 0) {
      // Update hash even if no meaningful changes detected
      await env.DB.prepare(`
        UPDATE webhook_state SET issues_hash = ?, issues_snapshot = ?, updated_at = CURRENT_TIMESTAMP
        WHERE repo_owner = ? AND repo_name = ?
      `).bind(currentHash, JSON.stringify(currentIssues), repoOwner, repoName).run()
      return new Response('OK', { status: 200 })
    }

    // Get users to notify (those with email notifications enabled who track this repo)
    const usersToNotify = await env.DB.prepare(`
      SELECT DISTINCT u.id, u.github_login, u.email, u.email_notifications
      FROM users u
      JOIN repos r ON r.user_id = u.id
      WHERE r.owner = ? AND r.name = ?
        AND u.email IS NOT NULL
        AND u.email_notifications = 1
    `).bind(repoOwner, repoName).all() as { results: UserWithEmail[] }

    // Send notifications
    if (env.RESEND_API_KEY) {
      for (const change of changes) {
        for (const user of usersToNotify.results) {
          // Only notify if user is assignee or creator
          const isAssignee = change.issue.assignee === user.github_login
          const isCreator = change.issue.created_by === user.github_login

          if (isAssignee || isCreator) {
            const { subject, html } = formatEmail(repoFullName, change.issue, change.changeType, change.oldIssue)
            await sendEmail(user.email, subject, html, env.RESEND_API_KEY)
          }
        }
      }
    }

    // Update state
    await env.DB.prepare(`
      UPDATE webhook_state SET issues_hash = ?, issues_snapshot = ?, updated_at = CURRENT_TIMESTAMP
      WHERE repo_owner = ? AND repo_name = ?
    `).bind(currentHash, JSON.stringify(currentIssues), repoOwner, repoName).run()

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('Webhook processing error:', err)
    return new Response('Internal error', { status: 500 })
  }
}
