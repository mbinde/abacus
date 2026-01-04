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
}

interface Props {
  onBack: () => void
}

export default function AdminPanel({ onBack }: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [settings, setSettings] = useState<Settings>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    await Promise.all([loadUsers(), loadSettings()])
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

  async function handleRegistrationModeChange(mode: 'open' | 'closed') {
    setError(null)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'registration_mode', value: mode }),
      })
      if (res.ok) {
        setSettings(prev => ({ ...prev, registration_mode: mode }))
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>Registration:</span>
            <select
              value={settings.registration_mode || 'open'}
              onChange={(e) => handleRegistrationModeChange(e.target.value as 'open' | 'closed')}
              style={{ padding: '0.25rem' }}
            >
              <option value="open">Open (anyone can sign up)</option>
              <option value="closed">Closed (existing users only)</option>
            </select>
          </label>
        </div>
      </div>

      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Users</h3>

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
    </div>
  )
}
