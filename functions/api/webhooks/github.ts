// /api/webhooks/github - Handle GitHub webhook events for issue change notifications

import { decryptToken } from '../../lib/crypto'
import { queueNotification } from '../notifications/queue'

interface Env {
  DB: D1Database
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
  notify_issues: string | null
  notify_actions: string | null
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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  const signature = request.headers.get('X-Hub-Signature-256')
  const payload = await request.text()

  const event = request.headers.get('X-GitHub-Event')

  console.log('[webhook] Received event:', event)

  // Parse payload to get repo info for signature verification
  let data: PushEvent
  try {
    data = JSON.parse(payload) as PushEvent
  } catch {
    return new Response('Invalid payload', { status: 400 })
  }

  const repoOwner = data.repository.owner.login
  const repoName = data.repository.name
  const repoFullName = data.repository.full_name

  try {
    // Look up the webhook secret for this repo (now global, not per-user)
    const repo = await env.DB.prepare(
      'SELECT id, webhook_secret, webhook_owner_id FROM repos WHERE owner = ? AND name = ?'
    ).bind(repoOwner, repoName).first() as { id: number; webhook_secret: string | null; webhook_owner_id: number | null } | null

    if (!repo) {
      // No one tracking this repo, nothing to do
      return new Response('OK', { status: 200 })
    }

    // Try to verify against confirmed webhook secret first
    let isValid = false
    if (repo.webhook_secret) {
      isValid = await verifySignature(payload, signature, repo.webhook_secret)
    }

    // If not valid, check provisional secrets (someone might be verifying their setup)
    if (!isValid) {
      const provisionalSecrets = await env.DB.prepare(
        'SELECT id, user_id, secret FROM provisional_webhook_secrets WHERE repo_id = ?'
      ).bind(repo.id).all() as { results: Array<{ id: number; user_id: number; secret: string }> }

      for (const provisional of provisionalSecrets.results) {
        if (await verifySignature(payload, signature, provisional.secret)) {
          isValid = true
          // Mark this provisional secret as verified by updating its timestamp
          await env.DB.prepare(
            'UPDATE provisional_webhook_secrets SET verified_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).bind(provisional.id).run()
          break
        }
      }
    }

    if (!isValid) {
      return new Response('Invalid signature', { status: 401 })
    }

    // Handle ping events (just acknowledge, used for verification)
    if (event === 'ping') {
      return new Response('Pong', { status: 200 })
    }

    // Only handle push events for notifications
    if (event !== 'push') {
      return new Response('OK', { status: 200 })
    }

    // Check if any commits modified .beads/issues.jsonl
    const beadsModified = data.commits.some(commit =>
      commit.modified.includes('.beads/issues.jsonl') ||
      commit.added.includes('.beads/issues.jsonl')
    )

    console.log('[webhook] beadsModified:', beadsModified, 'commits:', data.commits.length)

    if (!beadsModified) {
      return new Response('OK', { status: 200 })
    }

    // Get a user's token to fetch the issues (any user with this repo will do)
    const userWithToken = await env.DB.prepare(`
      SELECT u.github_token_encrypted
      FROM users u
      JOIN user_repos ur ON ur.user_id = u.id
      WHERE ur.repo_id = ?
      LIMIT 1
    `).bind(repo.id).first() as { github_token_encrypted: string } | null

    if (!userWithToken) {
      return new Response('OK', { status: 200 })
    }

    // Get previous state from database
    const prevState = await env.DB.prepare(
      'SELECT issues_hash, issues_snapshot FROM webhook_state WHERE repo_owner = ? AND repo_name = ?'
    ).bind(repoOwner, repoName).first() as WebhookState | null

    const token = await decryptToken(userWithToken.github_token_encrypted, env.TOKEN_ENCRYPTION_KEY)

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

    console.log('[webhook] Detected changes:', changes.length, changes.map(c => ({ id: c.issue.id, type: c.changeType })))

    if (changes.length === 0) {
      // Update hash even if no meaningful changes detected
      await env.DB.prepare(`
        UPDATE webhook_state SET issues_hash = ?, issues_snapshot = ?, updated_at = CURRENT_TIMESTAMP
        WHERE repo_owner = ? AND repo_name = ?
      `).bind(currentHash, JSON.stringify(currentIssues), repoOwner, repoName).run()
      return new Response('OK', { status: 200 })
    }

    // Get users to notify with their per-repo settings
    const usersToNotify = await env.DB.prepare(`
      SELECT DISTINCT u.id, u.github_login, u.email,
        COALESCE(urs.notify_issues, 'assigned') as notify_issues,
        COALESCE(urs.notify_actions, 'open,update,close') as notify_actions
      FROM users u
      JOIN user_repos ur ON ur.user_id = u.id
      JOIN repos r ON r.id = ur.repo_id
      LEFT JOIN user_repo_settings urs ON urs.user_id = u.id AND urs.repo_id = r.id
      WHERE r.owner = ? AND r.name = ?
        AND u.email IS NOT NULL
    `).bind(repoOwner, repoName).all() as { results: UserWithEmail[] }

    console.log('[webhook] Users to notify:', usersToNotify.results.map(u => ({
      login: u.github_login,
      email: u.email ? 'set' : 'null',
      notify_issues: u.notify_issues,
      notify_actions: u.notify_actions
    })))

    // Queue notifications for batched sending
    // Get all starred issues for this repo to check favorites
    const issueIds = changes.map(c => c.issue.id)
    const userIds = usersToNotify.results.map(u => u.id)

    // Build a set of "userId:issueId" for quick lookup
    const starredSet = new Set<string>()
    if (userIds.length > 0 && issueIds.length > 0) {
      const starsResult = await env.DB.prepare(`
        SELECT user_id, issue_id FROM stars
        WHERE repo_owner = ? AND repo_name = ?
          AND user_id IN (${userIds.map(() => '?').join(',')})
          AND issue_id IN (${issueIds.map(() => '?').join(',')})
      `).bind(repoOwner, repoName, ...userIds, ...issueIds).all() as { results: Array<{ user_id: number; issue_id: string }> }

      for (const star of starsResult.results) {
        starredSet.add(`${star.user_id}:${star.issue_id}`)
      }
    }

    for (const change of changes) {
      // Map changeType to action
      const action = change.changeType === 'created' ? 'open' : change.changeType

      for (const user of usersToNotify.results) {
        const notifyIssues = user.notify_issues || 'assigned'
        const notifyActions = (user.notify_actions || 'open,update,close').split(',')

        // Skip if user doesn't want notifications for this action
        if (!notifyActions.includes(action)) {
          continue
        }

        // Skip if notify_issues is 'none'
        if (notifyIssues === 'none') {
          continue
        }

        // Check if user should be notified based on their settings
        const isAssignee = change.issue.assignee === user.github_login
        const isFavorite = starredSet.has(`${user.id}:${change.issue.id}`)

        let shouldNotify = false
        if (notifyIssues === 'all') {
          shouldNotify = true
        } else if (notifyIssues === 'assigned') {
          shouldNotify = isAssignee
        } else if (notifyIssues === 'favorites') {
          shouldNotify = isFavorite
        }

        if (shouldNotify) {
          console.log('[webhook] Queueing notification for:', user.github_login, 'issue:', change.issue.id, 'action:', change.changeType)
          await queueNotification(env.DB, {
            userId: user.id,
            repoOwner,
            repoName,
            issueId: change.issue.id,
            issueTitle: change.issue.title,
            changeType: change.changeType,
            changeDetails: change.oldIssue ? JSON.stringify({
              oldStatus: change.oldIssue.status,
              newStatus: change.issue.status,
              oldAssignee: change.oldIssue.assignee,
              newAssignee: change.issue.assignee,
            }) : undefined,
          })
        } else {
          console.log('[webhook] Skipping notification for:', user.github_login, 'notifyIssues:', notifyIssues, 'shouldNotify:', shouldNotify)
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
