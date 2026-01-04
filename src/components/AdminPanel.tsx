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

interface Props {
  onBack: () => void
}

export default function AdminPanel({ onBack }: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadUsers()
  }, [])

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
        <h2>User Management</h2>
        <button onClick={onBack}>Back</button>
      </div>

      {error && <div className="error mb-2">{error}</div>}

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
                      <div style={{ fontSize: '0.75rem', color: '#666' }}>
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
                    style={{
                      background: '#dc3545',
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
