import { useState, useEffect, useCallback, useRef } from 'react'
import Login from './components/Login'
import RepoSelector from './components/RepoSelector'
import IssueList from './components/IssueList'
import IssueForm from './components/IssueForm'
import AdminPanel from './components/AdminPanel'

interface Repo {
  id: number
  owner: string
  name: string
}

interface Issue {
  id: string
  title: string
  description?: string
  status: 'open' | 'closed' | 'in_progress'
  priority: number
  issue_type: 'bug' | 'feature' | 'task' | 'epic'
  created_at: string
  updated_at?: string
  closed_at?: string
  parent?: string
  sha?: string
}

interface User {
  id: number
  login: string
  name: string | null
  avatarUrl: string
  role: 'admin' | 'premium' | 'user'
}

type View = 'list' | 'create' | 'edit' | 'admin'

interface AppState {
  view: View
  issueId?: string
}

function parseUrlState(): AppState {
  const path = window.location.pathname
  if (path === '/admin') {
    return { view: 'admin' }
  }
  if (path === '/new') {
    return { view: 'create' }
  }
  const editMatch = path.match(/^\/edit\/(.+)$/)
  if (editMatch) {
    return { view: 'edit', issueId: editMatch[1] }
  }
  return { view: 'list' }
}

function buildUrl(state: AppState): string {
  switch (state.view) {
    case 'admin':
      return '/admin'
    case 'create':
      return '/new'
    case 'edit':
      return `/edit/${state.issueId}`
    default:
      return '/'
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [repos, setRepos] = useState<Repo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null)
  const [issues, setIssues] = useState<Issue[]>([])
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)
  const [view, setView] = useState<View>('list')
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isPopState = useRef(false)
  const pendingIssueId = useRef<string | null>(null)

  // Navigate with history support
  const navigate = useCallback((newView: View, issue?: Issue | null) => {
    const state: AppState = { view: newView, issueId: issue?.id }
    const url = buildUrl(state)

    if (!isPopState.current) {
      window.history.pushState(state, '', url)
    }
    isPopState.current = false

    setView(newView)
    setSelectedIssue(issue ?? null)
  }, [])

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      isPopState.current = true
      const state = parseUrlState()
      setView(state.view)

      if (state.view === 'edit' && state.issueId) {
        // Find issue in loaded issues, or store for later lookup
        const issue = issues.find(i => i.id === state.issueId)
        if (issue) {
          setSelectedIssue(issue)
        } else {
          pendingIssueId.current = state.issueId
        }
      } else {
        setSelectedIssue(null)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [issues])

  // Resolve pending issue when issues load
  useEffect(() => {
    if (pendingIssueId.current && issues.length > 0) {
      const issue = issues.find(i => i.id === pendingIssueId.current)
      if (issue) {
        setSelectedIssue(issue)
      }
      pendingIssueId.current = null
    }
  }, [issues])

  // Initialize state from URL on mount
  useEffect(() => {
    const state = parseUrlState()
    if (state.view !== 'list') {
      setView(state.view)
      if (state.issueId) {
        pendingIssueId.current = state.issueId
      }
    }
    // Replace current history entry with state
    window.history.replaceState(state, '', buildUrl(state))
  }, [])

  useEffect(() => {
    // Check for OAuth error in URL
    const params = new URLSearchParams(window.location.search)
    const errorParam = params.get('error')
    if (errorParam) {
      setAuthError(decodeURIComponent(errorParam))
      // Clean up URL but preserve path
      window.history.replaceState({}, '', window.location.pathname)
    }
    checkAuth()
  }, [])

  useEffect(() => {
    if (user) {
      loadRepos()
    }
  }, [user])

  useEffect(() => {
    if (selectedRepo) {
      // Save selected repo to localStorage
      localStorage.setItem('abacus:selectedRepo', JSON.stringify({
        owner: selectedRepo.owner,
        name: selectedRepo.name,
      }))
      loadIssues()
    }
  }, [selectedRepo])

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/check')
      if (res.ok) {
        const data = await res.json() as { authenticated: boolean; user?: User }
        if (data.authenticated && data.user) {
          setUser(data.user)
        }
      }
    } catch {
      // Not authenticated
    } finally {
      setLoading(false)
    }
  }

  async function loadRepos() {
    try {
      const res = await fetch('/api/repos')
      if (res.ok) {
        const data = await res.json() as { repos: Repo[] }
        setRepos(data.repos)
        if (data.repos.length > 0 && !selectedRepo) {
          // Try to restore last selected repo from localStorage
          const savedRepo = localStorage.getItem('abacus:selectedRepo')
          if (savedRepo) {
            const { owner, name } = JSON.parse(savedRepo)
            const found = data.repos.find(r => r.owner === owner && r.name === name)
            if (found) {
              setSelectedRepo(found)
              return
            }
          }
          setSelectedRepo(data.repos[0])
        }
      }
    } catch (err) {
      console.error('Failed to load repos:', err)
    }
  }

  async function loadIssues() {
    if (!selectedRepo) return
    setDataLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/repos/${selectedRepo.owner}/${selectedRepo.name}/issues`)
      if (res.ok) {
        const data = await res.json() as { issues: Issue[] }
        setIssues(data.issues)
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to load issues')
      }
    } catch {
      setError('Failed to connect to server')
    } finally {
      setDataLoading(false)
    }
  }

  async function handleAddRepo(owner: string, name: string) {
    try {
      const res = await fetch('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, name }),
      })
      if (res.ok) {
        const data = await res.json() as { repo: Repo }
        setRepos([...repos, data.repo])
        setSelectedRepo(data.repo)
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to add repo')
      }
    } catch {
      setError('Failed to add repo')
    }
  }

  async function handleSaveIssue(issue: Partial<Issue>) {
    if (!selectedRepo) return
    setDataLoading(true)
    setError(null)

    const isNew = !issue.id
    const url = isNew
      ? `/api/repos/${selectedRepo.owner}/${selectedRepo.name}/issues`
      : `/api/repos/${selectedRepo.owner}/${selectedRepo.name}/issues/${issue.id}`

    try {
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(issue),
      })

      if (res.ok) {
        await loadIssues()
        navigate('list')
      } else {
        const data = await res.json() as { conflict?: boolean; serverVersion?: Issue; error?: string }
        if (data.conflict && data.serverVersion) {
          // Handle conflict - show both versions
          setError(`Conflict detected! Someone else modified this issue. Their version: "${data.serverVersion.title}"`)
        } else {
          setError(data.error || 'Failed to save issue')
        }
      }
    } catch {
      setError('Failed to save issue')
    } finally {
      setDataLoading(false)
    }
  }

  async function handleDeleteIssue(id: string) {
    if (!selectedRepo || !confirm('Delete this issue?')) return
    setDataLoading(true)
    try {
      const res = await fetch(`/api/repos/${selectedRepo.owner}/${selectedRepo.name}/issues/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        await loadIssues()
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to delete issue')
      }
    } catch {
      setError('Failed to delete issue')
    } finally {
      setDataLoading(false)
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    setRepos([])
    setSelectedRepo(null)
    setIssues([])
  }

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  if (!user) {
    return <Login error={authError} />
  }

  // Admin panel view
  if (view === 'admin') {
    return (
      <div className="container">
        <AdminPanel onBack={() => navigate('list')} />
      </div>
    )
  }

  return (
    <div className="container">
      <header className="flex-between mb-3">
        <h1>Abacus</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {user.role === 'admin' && (
            <button onClick={() => navigate('admin')}>
              Admin
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <img
              src={user.avatarUrl}
              alt={user.login}
              style={{ width: 28, height: 28, borderRadius: '50%' }}
            />
            <span style={{ fontSize: '0.875rem' }}>{user.name || user.login}</span>
          </div>
          <button onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <RepoSelector
        repos={repos}
        selected={selectedRepo}
        onSelect={setSelectedRepo}
        onAdd={handleAddRepo}
      />

      {error && <div className="error">{error}</div>}

      {selectedRepo && (
        <>
          <div className="flex-between mb-2">
            <h2>{selectedRepo.owner}/{selectedRepo.name}</h2>
            {view === 'list' && (
              <button onClick={() => navigate('create')}>
                New Issue
              </button>
            )}
            {view !== 'list' && (
              <button onClick={() => navigate('list')}>
                Back to List
              </button>
            )}
          </div>

          {dataLoading && <div className="loading">Loading...</div>}

          {!dataLoading && view === 'list' && (
            <IssueList
              issues={issues}
              onEdit={(issue) => navigate('edit', issue)}
              onDelete={handleDeleteIssue}
            />
          )}

          {!dataLoading && (view === 'create' || view === 'edit') && (
            <IssueForm
              issue={selectedIssue}
              onSave={handleSaveIssue}
              onCancel={() => navigate('list')}
            />
          )}
        </>
      )}
    </div>
  )
}
