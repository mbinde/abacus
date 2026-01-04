import { useState, useEffect, FormEvent } from 'react'

interface Repo {
  id: number
  owner: string
  name: string
  webhook_configured: boolean
  webhook_is_owner: boolean
}

interface WebhookStatus {
  configured: boolean
  isOwner: boolean
  secret: string | null
  provisionalSecret: string | null
  canConfigure: boolean
}

interface RepoSettings {
  notify_issues: 'none' | 'favorites' | 'assigned' | 'all'
  notify_actions: string
}

interface User {
  id: number
  login: string
  name: string | null
  avatarUrl: string
  role: 'admin' | 'premium' | 'user'
}

interface ProfileData {
  email: string | null
}

interface Props {
  user: User
  repos: Repo[]
  onBack: () => void
  onAddRepo: (owner: string, name: string) => Promise<void>
  onRemoveRepo: (repoId: number) => Promise<void>
  onReposChange?: () => void
}

export default function Profile({ user, repos, onBack, onAddRepo, onRemoveRepo, onReposChange }: Props) {
  const isPremium = user.role === 'premium' || user.role === 'admin'
  const [showAddForm, setShowAddForm] = useState(false)
  const [repoUrl, setRepoUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedRepo, setExpandedRepo] = useState<number | null>(null)
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(null)
  const [repoSettings, setRepoSettings] = useState<RepoSettings | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

  // Email settings
  const [email, setEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    try {
      const res = await fetch('/api/user/profile')
      if (res.ok) {
        const data = await res.json() as { profile: ProfileData }
        setEmail(data.profile.email || '')
      }
    } catch {
      // Profile data optional, continue without it
    }
  }

  async function loadRepoData(repoId: number) {
    setDrawerLoading(true)
    try {
      const [webhookRes, settingsRes] = await Promise.all([
        fetch(`/api/repos/${repoId}/webhook`),
        fetch(`/api/repos/${repoId}/settings`),
      ])

      if (webhookRes.ok) {
        setWebhookStatus(await webhookRes.json() as WebhookStatus)
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json() as { settings: RepoSettings }
        setRepoSettings(data.settings)
      }
    } catch {
      setError('Failed to load repository settings')
    } finally {
      setDrawerLoading(false)
    }
  }

  async function handleToggleRepo(repoId: number) {
    if (expandedRepo === repoId) {
      setExpandedRepo(null)
      setWebhookStatus(null)
      setRepoSettings(null)
    } else {
      setExpandedRepo(repoId)
      await loadRepoData(repoId)
    }
  }

  async function handleConfigureWebhook(repoId: number) {
    setDrawerLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/repos/${repoId}/webhook/configure`, { method: 'POST' })
      if (res.ok) {
        await loadRepoData(repoId)
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to start configuration')
      }
    } catch {
      setError('Failed to start configuration')
    } finally {
      setDrawerLoading(false)
    }
  }

  async function handleConfirmWebhook(repoId: number) {
    setDrawerLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/repos/${repoId}/webhook/confirm`, { method: 'POST' })
      if (res.ok) {
        setSuccess('Webhook configured successfully!')
        setTimeout(() => setSuccess(null), 3000)
        await loadRepoData(repoId)
        onReposChange?.()
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to confirm configuration')
      }
    } catch {
      setError('Failed to confirm configuration')
    } finally {
      setDrawerLoading(false)
    }
  }

  async function handleDeleteWebhook(repoId: number) {
    if (!confirm('Delete webhook configuration? Other users will be able to reconfigure it.')) {
      return
    }
    setDrawerLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/repos/${repoId}/webhook`, { method: 'DELETE' })
      if (res.ok) {
        setSuccess('Webhook deleted')
        setTimeout(() => setSuccess(null), 3000)
        await loadRepoData(repoId)
        onReposChange?.()
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to delete webhook')
      }
    } catch {
      setError('Failed to delete webhook')
    } finally {
      setDrawerLoading(false)
    }
  }

  async function handleSaveSettings(repoId: number, settings: Partial<RepoSettings>) {
    setSavingSettings(true)
    setError(null)
    try {
      const res = await fetch(`/api/repos/${repoId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        setSuccess('Settings saved')
        setTimeout(() => setSuccess(null), 2000)
        // Update local state
        setRepoSettings(prev => prev ? { ...prev, ...settings } : null)
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to save settings')
      }
    } catch {
      setError('Failed to save settings')
    } finally {
      setSavingSettings(false)
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setSuccess('Copied to clipboard')
    setTimeout(() => setSuccess(null), 2000)
  }

  async function handleSaveEmail() {
    setError(null)
    setSuccess(null)
    setSavingEmail(true)

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email || null }),
      })

      if (res.ok) {
        setSuccess('Email saved')
        setTimeout(() => setSuccess(null), 3000)
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to save email')
      }
    } catch {
      setError('Failed to save email')
    } finally {
      setSavingEmail(false)
    }
  }

  function parseRepoUrl(url: string): { owner: string; name: string } | null {
    const cleaned = url.replace(/^https?:\/\//, '').replace(/^github\.com\//, '').replace(/\.git$/, '').trim()
    const parts = cleaned.split('/')
    if (parts.length >= 2) {
      return { owner: parts[0], name: parts[1] }
    }
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const parsed = parseRepoUrl(repoUrl)
    if (!parsed) {
      setError('Invalid repo URL. Use format: owner/repo or https://github.com/owner/repo')
      return
    }

    setLoading(true)
    try {
      await onAddRepo(parsed.owner, parsed.name)
      setRepoUrl('')
      setShowAddForm(false)
    } catch (err) {
      setError((err as Error).message || 'Failed to add repository')
    } finally {
      setLoading(false)
    }
  }

  async function handleRemove(repo: Repo) {
    if (!confirm(`Remove ${repo.owner}/${repo.name} from your repositories?`)) {
      return
    }

    setError(null)
    setLoading(true)
    try {
      await onRemoveRepo(repo.id)
      if (expandedRepo === repo.id) {
        setExpandedRepo(null)
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to remove repository')
    } finally {
      setLoading(false)
    }
  }

  function renderRepoDrawer(repo: Repo) {
    if (expandedRepo !== repo.id) return null

    if (drawerLoading) {
      return <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.75rem', padding: '0.5rem' }}>Loading...</div>
    }

    const { configured, isOwner, secret, provisionalSecret, canConfigure } = webhookStatus || {}
    const actions = repoSettings?.notify_actions?.split(',') || ['open', 'update', 'close']

    return (
      <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#0d0d12', borderRadius: '4px' }}>
        {/* Notification Settings */}
        {isPremium && configured && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Notification Settings</div>

            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>Notify me about:</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {(['none', 'favorites', 'assigned', 'all'] as const).map(option => (
                  <button
                    key={option}
                    onClick={() => handleSaveSettings(repo.id, { notify_issues: option })}
                    disabled={savingSettings}
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.25rem 0.5rem',
                      background: repoSettings?.notify_issues === option ? '#1a5a3a' : '#2a2a3a',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                    }}
                  >
                    {option === 'none' && 'None'}
                    {option === 'favorites' && 'Favorites'}
                    {option === 'assigned' && 'Assigned to me'}
                    {option === 'all' && 'All issues'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>On these actions:</div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {(['open', 'update', 'close'] as const).map(action => {
                  const isActive = actions.includes(action)
                  return (
                    <button
                      key={action}
                      onClick={() => {
                        const newActions = isActive
                          ? actions.filter(a => a !== action)
                          : [...actions, action]
                        handleSaveSettings(repo.id, { notify_actions: newActions.join(',') })
                      }}
                      disabled={savingSettings}
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.5rem',
                        background: isActive ? '#1a5a3a' : '#2a2a3a',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                      }}
                    >
                      {action.charAt(0).toUpperCase() + action.slice(1)}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Webhook Configuration */}
        <div style={{ fontSize: '0.75rem' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Webhook Configuration</div>

          {configured && isOwner && secret && (
            <div>
              <div style={{ color: '#4ade80', marginBottom: '0.5rem' }}>✓ Configured (you own this)</div>
              <div style={{ color: '#888', marginBottom: '0.25rem' }}>Secret:</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <code style={{ background: '#1a1a24', padding: '0.25rem 0.5rem', borderRadius: '3px', flex: 1, wordBreak: 'break-all', fontSize: '0.7rem' }}>
                  {secret}
                </code>
                <button onClick={() => copyToClipboard(secret)} style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}>
                  Copy
                </button>
              </div>
              <button
                onClick={() => handleDeleteWebhook(repo.id)}
                className="btn-danger"
                style={{ marginTop: '0.5rem', fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}
              >
                Delete Webhook
              </button>
            </div>
          )}

          {configured && !isOwner && (
            <div style={{ color: '#888' }}>
              ✓ Configured by another user. You'll receive notifications but can't manage the webhook.
            </div>
          )}

          {!configured && canConfigure && !provisionalSecret && (
            <div>
              <div style={{ color: '#888', marginBottom: '0.5rem' }}>Not configured. Set up a GitHub webhook to receive notifications.</div>
              <button
                onClick={() => handleConfigureWebhook(repo.id)}
                style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem' }}
              >
                Configure Webhook
              </button>
            </div>
          )}

          {provisionalSecret && (
            <div>
              <div style={{ color: '#f59e0b', marginBottom: '0.5rem' }}>⏳ Configuration in progress</div>
              <div style={{ color: '#888', marginBottom: '0.5rem' }}>
                1. Go to <a href={`https://github.com/${repo.owner}/${repo.name}/settings/hooks/new`} target="_blank" rel="noopener noreferrer">Add webhook</a><br />
                2. Payload URL: <code style={{ background: '#1a1a24', padding: '0.125rem 0.25rem', borderRadius: '2px' }}>{window.location.origin}/api/webhooks/github</code><br />
                3. Content type: <code style={{ background: '#1a1a24', padding: '0.125rem 0.25rem', borderRadius: '2px' }}>application/json</code><br />
                4. Secret: (value below)<br />
                5. Select "Just the push event"<br />
                6. Click "Add webhook", then Confirm below
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <code style={{ background: '#1a1a24', padding: '0.25rem 0.5rem', borderRadius: '3px', flex: 1, wordBreak: 'break-all', fontSize: '0.7rem' }}>
                  {provisionalSecret}
                </code>
                <button onClick={() => copyToClipboard(provisionalSecret)} style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}>
                  Copy
                </button>
              </div>
              <button
                onClick={() => handleConfirmWebhook(repo.id)}
                style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem' }}
              >
                Confirm Webhook Configured
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex-between mb-3">
        <h2>Profile</h2>
        <button onClick={onBack}>Back</button>
      </div>

      {error && <div className="error mb-2">{error}</div>}
      {success && <div className="success mb-2">{success}</div>}

      <div className="mb-3" style={{ padding: '1rem', background: '#1a1a24', borderRadius: '4px', border: '1px solid #2a2a3a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img
            src={user.avatarUrl}
            alt={user.login}
            style={{ width: 64, height: 64, borderRadius: '50%' }}
          />
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              {user.name || user.login}
            </div>
            <div style={{ color: '#888' }}>@{user.login}</div>
            <div style={{ marginTop: '0.25rem' }}>
              <span className={`badge badge-${user.role === 'admin' ? 'feature' : user.role === 'premium' ? 'epic' : 'task'}`}>
                {user.role}
              </span>
            </div>
          </div>
        </div>
      </div>

      {isPremium && (
        <div className="mb-3" style={{ padding: '1rem', background: '#1a1a24', borderRadius: '4px', border: '1px solid #2a2a3a' }}>
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Email for Notifications</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={{ width: '100%', maxWidth: '300px' }}
            />
            <button
              onClick={handleSaveEmail}
              disabled={savingEmail}
              style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem', flexShrink: 0 }}
            >
              {savingEmail ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div className="flex-between mb-2">
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Repositories ({repos.length})</h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}
        >
          {showAddForm ? 'Cancel' : 'Add Repo'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="mb-2">
          <div className="flex">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="owner/repo or https://github.com/owner/repo"
              autoFocus
              disabled={loading}
            />
            <button type="submit" style={{ flexShrink: 0 }} disabled={loading}>
              {loading ? 'Adding...' : 'Add'}
            </button>
          </div>
        </form>
      )}

      {repos.length === 0 ? (
        <p style={{ color: '#888', textAlign: 'center', padding: '1rem' }}>
          No repositories added yet. Add a repo to get started.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {repos.map(repo => (
            <div key={repo.id} style={{ background: '#1a1a24', borderRadius: '4px', border: '1px solid #2a2a3a' }}>
              <div
                className="flex-between"
                style={{ padding: '0.75rem', cursor: isPremium ? 'pointer' : undefined }}
                onClick={isPremium ? () => handleToggleRepo(repo.id) : undefined}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <a
                    href={`https://github.com/${repo.owner}/${repo.name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {repo.owner}/{repo.name}
                  </a>
                  {isPremium && repo.webhook_configured && (
                    <span style={{ fontSize: '0.7rem', color: '#4ade80' }}>
                      ✓
                    </span>
                  )}
                  {isPremium && (
                    <span style={{ fontSize: '0.7rem', color: '#666' }}>
                      {expandedRepo === repo.id ? '▼' : '▶'}
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemove(repo) }}
                  disabled={loading}
                  className="btn-danger"
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                >
                  Remove
                </button>
              </div>
              {renderRepoDrawer(repo)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
