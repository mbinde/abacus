import { useState, FormEvent } from 'react'

interface Repo {
  id: number
  owner: string
  name: string
}

interface User {
  id: number
  login: string
  name: string | null
  avatarUrl: string
  role: 'admin' | 'premium' | 'user'
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
  const [loading, setLoading] = useState(false)

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

      <div className="mb-3" style={{ padding: '1rem', background: '#f8f9fa', borderRadius: '4px' }}>
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
            <div style={{ color: '#666' }}>@{user.login}</div>
            <div style={{ marginTop: '0.25rem' }}>
              <span className={`badge badge-${user.role === 'admin' ? 'feature' : user.role === 'premium' ? 'epic' : 'task'}`}>
                {user.role}
              </span>
            </div>
          </div>
        </div>
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
        <p style={{ color: '#666', textAlign: 'center', padding: '1rem' }}>
          No repositories added yet. Add a repo to get started.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Repository</th>
              <th style={{ width: '100px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {repos.map(repo => (
              <tr key={repo.id}>
                <td>
                  <a
                    href={`https://github.com/${repo.owner}/${repo.name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#0066cc', textDecoration: 'none' }}
                  >
                    {repo.owner}/{repo.name}
                  </a>
                </td>
                <td>
                  <button
                    onClick={() => handleRemove(repo)}
                    disabled={loading}
                    style={{
                      background: '#dc3545',
                      fontSize: '0.75rem',
                      padding: '0.25rem 0.5rem'
                    }}
                  >
                    Remove
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
