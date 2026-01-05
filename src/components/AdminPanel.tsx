import { useState, useEffect } from 'react'

interface User {
  id: number
  github_id: number
  github_login: string
  github_name: string | null
  github_avatar_url: string
  role: 'admin' | 'premium' | 'user'
  created_at: string
  last_login_at: string | null
}

interface Settings {
  registration_mode?: 'open' | 'closed'
  notification_mode?: 'immediate' | 'batched'
}

interface RepoWebhook {
  id: number
  owner: string
  name: string
  webhook_owner_id: number | null
  webhook_owner_login: string | null
  webhook_configured: boolean
}

interface Props {
  onBack: () => void
}

type Tab = 'users' | 'webhooks'

export default function AdminPanel({ onBack }: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [webhooks, setWebhooks] = useState<RepoWebhook[]>([])
  const [settings, setSettings] = useState<Settings>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('users')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    await Promise.all([loadUsers(), loadSettings(), loadWebhooks()])
  }

  async function loadUsers() {
    try {
      const res = await fetch('/api/admin/users')
      if (res.ok) {
        const data = await res.json() as { users: User[] }
        setUsers(data.users)
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to load users')
      }
    } catch {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }

  async function loadSettings() {
    try {
      const res = await fetch('/api/admin/settings')
      if (res.ok) {
        const data = await res.json() as { settings: Settings }
        setSettings(data.settings)
      }
    } catch {
      // Settings might not exist yet, that's ok
    }
  }

  async function loadWebhooks() {
    try {
      const res = await fetch('/api/admin/webhooks')
      if (res.ok) {
        const data = await res.json() as { webhooks: RepoWebhook[] }
        setWebhooks(data.webhooks)
      }
    } catch {
      // Webhooks endpoint might not exist
    }
  }

  async function handleRevokeWebhook(repoId: number) {
    if (!confirm('Revoke webhook? This will clear the secret and owner.')) return
    setError(null)
    try {
      const res = await fetch('/api/admin/webhooks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_id: repoId, action: 'revoke' }),
      })
      if (res.ok) {
        await loadWebhooks()
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to revoke webhook')
      }
    } catch {
      setError('Failed to revoke webhook')
    }
  }

  async function handleTransferWebhook(repoId: number, newOwnerId: number) {
    setError(null)
    try {
      const res = await fetch('/api/admin/webhooks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_id: repoId, action: 'transfer', new_owner_id: newOwnerId }),
      })
      if (res.ok) {
        await loadWebhooks()
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to transfer webhook')
      }
    } catch {
      setError('Failed to transfer webhook')
    }
  }

  async function handleSettingChange(key: string, value: string) {
    setError(null)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
      if (res.ok) {
        setSettings(prev => ({ ...prev, [key]: value }))
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to update setting')
      }
    } catch {
      setError('Failed to update setting')
    }
  }

  async function handleRoleChange(userId: number, newRole: 'admin' | 'premium' | 'user') {
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      if (res.ok) {
        await loadUsers()
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to update user role')
      }
    } catch {
      setError('Failed to update user role')
    }
  }

  async function handleDelete(userId: number, login: string) {
    if (!confirm(`Delete user @${login}? This will also delete all their repositories.`)) {
      return
    }

    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
      if (res.ok) {
        await loadUsers()
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to delete user')
      }
    } catch {
      setError('Failed to delete user')
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return 'Never'
    return new Date(dateStr).toLocaleDateString()
  }

  return (
    <div className="card">
      <div className="flex-between mb-3">
        <h2>Admin Panel</h2>
        <button onClick={onBack}>Back</button>
      </div>

      {error && <div className="error mb-2">{error}</div>}

      <div className="mb-3" style={{ padding: '1rem', background: '#1a1a24', borderRadius: '4px', border: '1px solid #2a2a3a' }}>
        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Settings</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>Registration:</span>
            <select
              value={settings.registration_mode || 'open'}
              onChange={(e) => handleSettingChange('registration_mode', e.target.value)}
              style={{ padding: '0.25rem' }}
            >
              <option value="open">Open (anyone can sign up)</option>
              <option value="closed">Closed (existing users only)</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>Notifications:</span>
            <select
              value={settings.notification_mode || 'immediate'}
              onChange={(e) => handleSettingChange('notification_mode', e.target.value)}
              style={{ padding: '0.25rem' }}
            >
              <option value="immediate">Send immediately</option>
              <option value="batched">Batch with backoff (1-5 min)</option>
            </select>
          </label>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          onClick={() => setActiveTab('users')}
          style={{
            padding: '0.5rem 1rem',
            background: activeTab === 'users' ? '#0077cc' : '#2a2a3a',
            color: activeTab === 'users' ? 'white' : '#aaa',
          }}
        >
          Users ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('webhooks')}
          style={{
            padding: '0.5rem 1rem',
            background: activeTab === 'webhooks' ? '#0077cc' : '#2a2a3a',
            color: activeTab === 'webhooks' ? 'white' : '#aaa',
          }}
        >
          Webhooks ({webhooks.filter(w => w.webhook_configured).length}/{webhooks.length})
        </button>
      </div>

      {activeTab === 'users' && (
        <>
          {loading ? (
            <div className="loading">Loading...</div>
          ) : users.length === 0 ? (
            <p>No users found.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <img
                          src={user.github_avatar_url}
                          alt={user.github_login}
                          style={{ width: 24, height: 24, borderRadius: '50%' }}
                        />
                        <div>
                          <div>{user.github_name || user.github_login}</div>
                          <div style={{ fontSize: '0.75rem', color: '#888' }}>
                            @{user.github_login}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value as 'admin' | 'premium' | 'user')}
                        style={{ padding: '0.25rem' }}
                      >
                        <option value="admin">Admin</option>
                        <option value="premium">Premium</option>
                        <option value="user">User</option>
                      </select>
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>
                      {formatDate(user.last_login_at)}
                    </td>
                    <td>
                      <button
                        onClick={() => handleDelete(user.id, user.github_login)}
                        className="btn-danger"
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.5rem'
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {activeTab === 'webhooks' && (
        <>
          {loading ? (
            <div className="loading">Loading...</div>
          ) : webhooks.length === 0 ? (
            <p>No repositories found.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map(webhook => (
                  <tr key={webhook.id}>
                    <td>
                      <code style={{ fontSize: '0.875rem' }}>
                        {webhook.owner}/{webhook.name}
                      </code>
                    </td>
                    <td>
                      <span
                        className={`badge ${webhook.webhook_configured ? 'badge-open' : 'badge-closed'}`}
                      >
                        {webhook.webhook_configured ? 'Configured' : 'Not configured'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>
                      {webhook.webhook_owner_login ? (
                        <span style={{ color: '#4dc3ff' }}>@{webhook.webhook_owner_login}</span>
                      ) : (
                        <span style={{ color: '#666' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {webhook.webhook_configured && (
                          <button
                            onClick={() => handleRevokeWebhook(webhook.id)}
                            className="btn-danger"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          >
                            Revoke
                          </button>
                        )}
                        {webhook.webhook_owner_id && (
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) {
                                handleTransferWebhook(webhook.id, Number(e.target.value))
                                e.target.value = ''
                              }
                            }}
                            style={{ padding: '0.25rem', fontSize: '0.75rem' }}
                          >
                            <option value="" disabled>Transfer to...</option>
                            {users
                              .filter(u => u.id !== webhook.webhook_owner_id)
                              .map(u => (
                                <option key={u.id} value={u.id}>
                                  @{u.github_login}
                                </option>
                              ))}
                          </select>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}
