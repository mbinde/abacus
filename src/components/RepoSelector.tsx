import { useState, FormEvent } from 'react'

interface Repo {
  id: number
  owner: string
  name: string
}

interface Props {
  repos: Repo[]
  selected: Repo | null
  onSelect: (repo: Repo) => void
  onAdd: (owner: string, name: string) => void
}

export default function RepoSelector({ repos, selected, onSelect, onAdd }: Props) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [repoUrl, setRepoUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  function parseRepoUrl(url: string): { owner: string; name: string } | null {
    // Handle formats:
    // - https://github.com/owner/repo
    // - github.com/owner/repo
    // - owner/repo
    const cleaned = url.replace(/^https?:\/\//, '').replace(/^github\.com\//, '').replace(/\.git$/, '').trim()
    const parts = cleaned.split('/')
    if (parts.length >= 2) {
      return { owner: parts[0], name: parts[1] }
    }
    return null
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const parsed = parseRepoUrl(repoUrl)
    if (!parsed) {
      setError('Invalid repo URL. Use format: owner/repo or https://github.com/owner/repo')
      return
    }

    onAdd(parsed.owner, parsed.name)
    setRepoUrl('')
    setShowAddForm(false)
  }

  return (
    <div className="card mb-2">
      <div className="flex-between">
        <div className="flex" style={{ alignItems: 'center' }}>
          <label style={{ fontWeight: 600, marginRight: '0.5rem' }}>Repository:</label>
          {repos.length > 0 ? (
            <select
              value={selected ? `${selected.owner}/${selected.name}` : ''}
              onChange={(e) => {
                const repo = repos.find(r => `${r.owner}/${r.name}` === e.target.value)
                if (repo) onSelect(repo)
              }}
              style={{ width: 'auto', minWidth: '200px' }}
            >
              {repos.map((repo) => (
                <option key={repo.id} value={`${repo.owner}/${repo.name}`}>
                  {repo.owner}/{repo.name}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ color: '#666' }}>No repos added yet</span>
          )}
        </div>
        <button onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? 'Cancel' : 'Add Repo'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
          {error && <div className="error">{error}</div>}
          <div className="flex">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="owner/repo or https://github.com/owner/repo"
              autoFocus
            />
            <button type="submit" style={{ flexShrink: 0 }}>Add</button>
          </div>
        </form>
      )}
    </div>
  )
}
