import { useState, useEffect, FormEvent } from 'react'

interface Repo {
  id: number
  owner: string
  name: string
  webhook_secret?: string
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
  email_notifications: boolean
}

interface Props {
  user: User
  repos: Repo[]
  onBack: () => void
  onAddRepo: (owner: string, name: string) => Promise<void>
  onRemoveRepo: (repoId: number) => Promise<void>
}

export default function Profile({ user, repos, onBack, onAddRepo, onRemoveRepo }: Props) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [repoUrl, setRepoUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedSecrets, setExpandedSecrets] = useState<Set<number>>(new Set())

  // Email settings
  const [email, setEmail] = useState('')
  const [emailNotifications, setEmailNotifications] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)

  function toggleSecret(repoId: number) {
    setExpandedSecrets(prev => {
      const next = new Set(prev)
      if (next.has(repoId)) {
        next.delete(repoId)
      } else {
        next.add(repoId)
      }
      return next
    })
  }

  function copySecret(secret: string) {
    navigator.clipboard.writeText(secret)
    setSuccess('Webhook secret copied to clipboard')
    setTimeout(() => setSuccess(null), 2000)
  }

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    try {
      const res = await fetch('/api/user/profile')
      if (res.ok) {
        const data = await res.json() as { profile: ProfileData }
        setEmail(data.profile.email || '')
        setEmailNotifications(data.profile.email_notifications)
      }
    } catch {
      // Profile data optional, continue without it
    }
  }

  async function handleSaveEmail() {
    setError(null)
    setSuccess(null)
    setSavingEmail(true)

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email || null,
          email_notifications: emailNotifications,
        }),
      })

      if (res.ok) {
        setSuccess('Email settings saved')
        setTimeout(() => setSuccess(null), 3000)
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to save email settings')
      }
    } catch {
      setError('Failed to save email settings')
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
    } catch (err) {
      setError((err as Error).message || 'Failed to remove repository')
    } finally {
      setLoading(false)
    }
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

      <div className="mb-3" style={{ padding: '1rem', background: '#1a1a24', borderRadius: '4px', border: '1px solid #2a2a3a' }}>
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Email Notifications</h3>
        <div className="mb-2">
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            style={{ width: '100%', maxWidth: '300px' }}
          />
        </div>
        <div className="mb-2">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={emailNotifications}
              onChange={(e) => setEmailNotifications(e.target.checked)}
            />
            <span style={{ fontSize: '0.875rem' }}>Receive email notifications for issue changes</span>
          </label>
          <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.25rem', marginLeft: '1.5rem' }}>
            Get notified when issues assigned to you or created by you are updated
          </div>
        </div>
        <button
          onClick={handleSaveEmail}
          disabled={savingEmail}
          style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}
        >
          {savingEmail ? 'Saving...' : 'Save Email Settings'}
        </button>
      </div>

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
            <div key={repo.id} style={{ padding: '0.75rem', background: '#1a1a24', borderRadius: '4px', border: '1px solid #2a2a3a' }}>
              <div className="flex-between" style={{ marginBottom: repo.webhook_secret && expandedSecrets.has(repo.id) ? '0.5rem' : 0 }}>
                <a
                  href={`https://github.com/${repo.owner}/${repo.name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {repo.owner}/{repo.name}
                </a>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {repo.webhook_secret && (
                    <button
                      onClick={() => toggleSecret(repo.id)}
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                    >
                      {expandedSecrets.has(repo.id) ? 'Hide Secret' : 'Webhook Secret'}
                    </button>
                  )}
                  <button
                    onClick={() => handleRemove(repo)}
                    disabled={loading}
                    className="btn-danger"
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                  >
                    Remove
                  </button>
                </div>
              </div>
              {repo.webhook_secret && expandedSecrets.has(repo.id) && (
                <div style={{ fontSize: '0.75rem', color: '#888' }}>
                  <div style={{ marginBottom: '0.25rem' }}>
                    Use this secret when configuring the GitHub webhook:
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <code style={{
                      background: '#0d0d12',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '3px',
                      fontSize: '0.7rem',
                      wordBreak: 'break-all',
                      flex: 1
                    }}>
                      {repo.webhook_secret}
                    </code>
                    <button
                      onClick={() => copySecret(repo.webhook_secret!)}
                      style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem', flexShrink: 0 }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
