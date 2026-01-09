// /api/webhooks/github - Handle GitHub webhook events for issue change notifications

import { decryptToken } from '../../lib/crypto'
import { queueNotification } from '../notifications/queue'

interface Env {
  DB: D1Database
  RESEND_API_KEY: string
  TOKEN_ENCRYPTION_KEY: string
}

interface NotificationInfo {
  userId: number
  email: string
  repoOwner: string
  repoName: string
  issueId: string
  issueTitle: string
  changeType: 'created' | 'updated' | 'closed'
  changeDetails?: string
}

// Send email immediately via Resend
async function sendEmailImmediate(
  notification: NotificationInfo,
  apiKey: string
): Promise<boolean> {
  const statusEmoji = {
    open: '🟢',
    in_progress: '🔵',
    closed: '⚫',
  }

  const changeEmoji = {
    created: '✨',
    updated: '📝',
    closed: '✅',
  }

  const emoji = changeEmoji[notification.changeType] || '📋'
  const changeLabel = {
    created: 'Created',
    updated: 'Updated',
    closed: 'Closed',
  }[notification.changeType] || notification.changeType

  let details = ''
  if (notification.changeDetails) {
    try {
      const d = JSON.parse(notification.changeDetails)
      if (d.oldStatus !== d.newStatus) {
        const oldEmoji = statusEmoji[d.oldStatus as keyof typeof statusEmoji] || ''
        const newEmoji = statusEmoji[d.newStatus as keyof typeof statusEmoji] || ''
        details = `${oldEmoji} ${d.oldStatus} → ${newEmoji} ${d.newStatus}`
      }
      if (d.oldAssignee !== d.newAssignee) {
        if (details) details += ' · '
        details += `@${d.oldAssignee || 'unassigned'} → @${d.newAssignee || 'unassigned'}`
      }
    } catch {
      // Ignore parse errors
    }
  }

  const subject = `[${notification.repoOwner}/${notification.repoName}] ${emoji} ${notification.issueTitle}`
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333; border-bottom: 1px solid #ddd; padding-bottom: 8px;">
        ${emoji} Issue ${changeLabel}
      </h2>
      <div style="padding: 12px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid ${notification.changeType === 'created' ? '#4ade80' : notification.changeType === 'closed' ? '#666' : '#64b4ff'};">
        <div style="font-weight: 600; color: #333;">
          ${notification.issueTitle}
        </div>
        <div style="font-size: 12px; color: #888; margin-top: 4px;">
          <code>${notification.issueId}</code> · ${changeLabel}${details ? ` · ${details}` : ''}
        </div>
      </div>
      <p style="color: #999; font-size: 12px; margin-top: 24px; border-top: 1px solid #ddd; padding-top: 12px;">
        You received this because you have email notifications enabled in Abacus.
      </p>
    </div>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Abacus <notifications@motleywoods.dev>',
        to: [notification.email],
        subject,
        html,
      }),
    })
    if (!res.ok) {
      const errorText = await res.text()
      console.error('[webhook] Resend API error:', res.status, errorText)
    }
    return res.ok
  } catch (err) {
    console.error('[webhook] sendEmail exception:', err)
    return false
  }
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

// Constant-time string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const encoder = new TextEncoder()
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)
  let result = 0
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i]
  }
  return result === 0
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

  return timingSafeEqual(signature, expectedSignature)
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

  // Check content type - must be JSON
  const contentType = request.headers.get('Content-Type') || ''
  if (contentType.includes('x-www-form-urlencoded')) {
    console.error('[webhook] Wrong content type:', contentType)
    return new Response(
      'Webhook misconfigured: Content type must be "application/json", not "application/x-www-form-urlencoded". ' +
      'Please update your webhook settings on GitHub.',
      { status: 400 }
    )
  }

  // Parse payload
  let data: PushEvent
  try {
    data = JSON.parse(payload) as PushEvent
  } catch (err) {
    console.error('[webhook] Failed to parse payload:', err)
    console.error('[webhook] Raw payload (first 500 chars):', payload.substring(0, 500))
    console.error('[webhook] Payload length:', payload.length)
    return new Response('Invalid payload - expected JSON', { status: 400 })
  }

  // Check for required fields - ping events have different structure
  if (!data.repository?.owner?.login || !data.repository?.name) {
    console.log('[webhook] Missing repository info, event type:', event)
    // For ping events without full repo info, just acknowledge
    if (event === 'ping') {
      return new Response('Pong', { status: 200 })
    }
    return new Response('Missing repository info', { status: 400 })
  }

  const repoOwner = data.repository.owner.login
  const repoName = data.repository.name
  const repoFullName = data.repository.full_name

  try {
    console.log('[webhook] Processing for repo:', repoOwner, '/', repoName)

    // Look up the webhook secret for this repo (now global, not per-user)
    const repo = await env.DB.prepare(
      'SELECT id, webhook_secret, webhook_owner_id FROM repos WHERE owner = ? AND name = ?'
    ).bind(repoOwner, repoName).first() as { id: number; webhook_secret: string | null; webhook_owner_id: number | null } | null

    console.log('[webhook] Repo lookup result:', repo ? `id=${repo.id}, hasSecret=${!!repo.webhook_secret}` : 'not found')

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

      console.log('[webhook] Checking', provisionalSecrets.results.length, 'provisional secrets')

      for (const provisional of provisionalSecrets.results) {
        if (await verifySignature(payload, signature, provisional.secret)) {
          isValid = true
          console.log('[webhook] Matched provisional secret id:', provisional.id)
          // Mark this provisional secret as verified by updating its timestamp
          await env.DB.prepare(
            'UPDATE provisional_webhook_secrets SET verified_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).bind(provisional.id).run()
          break
        }
      }
    }

    if (!isValid) {
      console.log('[webhook] Signature verification failed')
      return new Response('Invalid signature', { status: 401 })
    }

    console.log('[webhook] Signature verified successfully')

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

    // Check notification mode setting (default: immediate)
    const notificationModeSetting = await env.DB.prepare(
      "SELECT value FROM settings WHERE key = 'notification_mode'"
    ).first() as { value: string } | null
    const notificationMode = notificationModeSetting?.value || 'immediate'
    console.log('[webhook] Notification mode:', notificationMode)

    // Process notifications
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
          const changeDetails = change.oldIssue ? JSON.stringify({
            oldStatus: change.oldIssue.status,
            newStatus: change.issue.status,
            oldAssignee: change.oldIssue.assignee,
            newAssignee: change.issue.assignee,
          }) : undefined

          if (notificationMode === 'batched') {
            console.log('[webhook] Queueing notification for:', user.github_login, 'issue:', change.issue.id, 'action:', change.changeType)
            await queueNotification(env.DB, {
              userId: user.id,
              repoOwner,
              repoName,
              issueId: change.issue.id,
              issueTitle: change.issue.title,
              changeType: change.changeType,
              changeDetails,
            })
          } else {
            // Send immediately
            console.log('[webhook] Sending notification immediately to:', user.github_login, 'issue:', change.issue.id, 'action:', change.changeType)
            if (env.RESEND_API_KEY) {
              await sendEmailImmediate({
                userId: user.id,
                email: user.email,
                repoOwner,
                repoName,
                issueId: change.issue.id,
                issueTitle: change.issue.title,
                changeType: change.changeType,
                changeDetails,
              }, env.RESEND_API_KEY)
            }
          }
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
