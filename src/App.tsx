import { useState, useEffect, useCallback, useRef } from 'react'
import Login from './components/Login'
import Header from './components/Header'
import RepoSelector from './components/RepoSelector'
import IssueList from './components/IssueList'
import IssueForm from './components/IssueForm'
import IssueView from './components/IssueView'
import AdminPanel from './components/AdminPanel'
import Profile from './components/Profile'
import ExecutorSettings from './components/ExecutorSettings'
import LoadingSkeleton from './components/LoadingSkeleton'
import ActivityFeed from './components/ActivityFeed'
import Dashboard from './components/Dashboard'

interface Repo {
  id: number
  owner: string
  name: string
  webhook_configured: boolean
  webhook_is_owner: boolean
}

interface Comment {
  id: number
  issue_id: string
  author: string
  text: string
  created_at: string
}

interface Issue {
  id: string
  title: string
  description?: string
  status: 'open' | 'closed' | 'in_progress'
  priority: number
  issue_type: 'bug' | 'feature' | 'task' | 'epic'
  assignee?: string
  created_at: string
  updated_at?: string
  closed_at?: string
  parent?: string
  sha?: string
  comments?: Comment[]
}

interface User {
  id: number
  login: string
  name: string | null
  avatarUrl: string
  role: 'admin' | 'premium' | 'user' | 'guest'
}

type View = 'list' | 'create' | 'edit' | 'issue' | 'admin' | 'profile' | 'executors' | 'activity' | 'dashboard'

interface AppState {
  view: View
  issueId?: string
}

function parseUrlState(): AppState {
  const path = window.location.pathname
  if (path === '/admin') {
    return { view: 'admin' }
  }
  if (path === '/profile') {
    return { view: 'profile' }
  }
  if (path === '/executors') {
    return { view: 'executors' }
  }
  if (path === '/activity') {
    return { view: 'activity' }
  }
  if (path === '/dashboard') {
    return { view: 'dashboard' }
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
    case 'profile':
      return '/profile'
    case 'executors':
      return '/executors'
    case 'activity':
      return '/activity'
    case 'dashboard':
      return '/dashboard'
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
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set())
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

      if ((state.view === 'edit' || state.view === 'issue') && state.issueId) {
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
      loadStars()
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
        // Update selectedIssue if it exists in the new data
        if (selectedIssue) {
          const updated = data.issues.find(i => i.id === selectedIssue.id)
          if (updated) {
            setSelectedIssue(updated)
          }
        }
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

  async function loadStars() {
    if (!selectedRepo) return
    try {
      const res = await fetch(`/api/repos/${selectedRepo.owner}/${selectedRepo.name}/stars`)
      if (res.ok) {
        const data = await res.json() as { starred: string[] }
        setStarredIds(new Set(data.starred))
      }
    } catch {
      // Silently fail - stars are optional
    }
  }

  async function handleToggleStar(issueId: string, star: boolean) {
    if (!selectedRepo) return

    // Optimistic update
    setStarredIds(prev => {
      const next = new Set(prev)
      if (star) {
        next.add(issueId)
      } else {
        next.delete(issueId)
      }
      return next
    })

    try {
      const res = await fetch(`/api/repos/${selectedRepo.owner}/${selectedRepo.name}/stars`, {
        method: star ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue_id: issueId }),
      })
      if (!res.ok) {
        // Revert on failure
        setStarredIds(prev => {
          const next = new Set(prev)
          if (star) {
            next.delete(issueId)
          } else {
            next.add(issueId)
          }
          return next
        })
      }
    } catch {
      // Revert on failure
      setStarredIds(prev => {
        const next = new Set(prev)
        if (star) {
          next.delete(issueId)
        } else {
          next.add(issueId)
        }
        return next
      })
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
        throw new Error(data.error || 'Failed to add repo')
      }
    } catch (err) {
      const message = (err as Error).message || 'Failed to add repo'
      setError(message)
      throw err
    }
  }

  async function handleRemoveRepo(repoId: number) {
    try {
      const res = await fetch(`/api/repos/${repoId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        const newRepos = repos.filter(r => r.id !== repoId)
        setRepos(newRepos)
        // If we removed the selected repo, select another one
        if (selectedRepo?.id === repoId) {
          setSelectedRepo(newRepos.length > 0 ? newRepos[0] : null)
          if (newRepos.length > 0) {
            localStorage.setItem('abacus:selectedRepo', JSON.stringify({
              owner: newRepos[0].owner,
              name: newRepos[0].name,
            }))
          } else {
            localStorage.removeItem('abacus:selectedRepo')
          }
        }
      } else {
        const data = await res.json() as { error?: string }
        throw new Error(data.error || 'Failed to remove repo')
      }
    } catch (err) {
      const message = (err as Error).message || 'Failed to remove repo'
      setError(message)
      throw err
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

  async function handleBulkUpdate(issueIds: string[], updates: { status?: string; priority?: number }) {
    if (!selectedRepo) return
    setDataLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/repos/${selectedRepo.owner}/${selectedRepo.name}/issues/bulk`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue_ids: issueIds, updates }),
      })

      if (res.ok) {
        await loadIssues()
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to bulk update issues')
      }
    } catch {
      setError('Failed to bulk update issues')
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
        <Header user={user} onNavigate={navigate} onLogout={handleLogout} />
        <AdminPanel onBack={() => navigate('list')} />
      </div>
    )
  }

  // Profile view
  if (view === 'profile') {
    return (
      <div className="container">
        <Header user={user} onNavigate={navigate} onLogout={handleLogout} />
        <Profile
          user={user}
          repos={repos}
          onBack={() => navigate('list')}
          onAddRepo={handleAddRepo}
          onRemoveRepo={handleRemoveRepo}
        />
      </div>
    )
  }

  // Executors view
  if (view === 'executors' && selectedRepo) {
    return (
      <div className="container">
        <Header user={user} onNavigate={navigate} onLogout={handleLogout} />
        <ExecutorSettings
          repoOwner={selectedRepo.owner}
          repoName={selectedRepo.name}
          onBack={() => navigate('list')}
        />
      </div>
    )
  }

  return (
    <div className="container">
      <Header user={user} onNavigate={navigate} onLogout={handleLogout} />

      {(view === 'list' || view === 'activity' || view === 'dashboard') ? (
        <RepoSelector
          repos={repos}
          selected={selectedRepo}
          onSelect={setSelectedRepo}
          onAdd={handleAddRepo}
        />
      ) : selectedRepo && (
        <div style={{ padding: '0.5rem 0', color: '#888', fontSize: '0.9rem' }}>
          {selectedRepo.owner}/{selectedRepo.name}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {selectedRepo && (
        <>
          <div className="flex-between mb-2">
            <h2>{selectedRepo.owner}/{selectedRepo.name}</h2>
            {(view === 'list' || view === 'activity' || view === 'dashboard') && (
              <div className="flex">
                <button
                  onClick={() => navigate('dashboard')}
                  style={{ background: view === 'dashboard' ? '#0077cc' : '#444' }}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => navigate('activity')}
                  style={{ background: view === 'activity' ? '#0077cc' : '#444' }}
                >
                  Activity
                </button>
                <button
                  onClick={() => navigate('list')}
                  style={{ background: view === 'list' ? '#0077cc' : '#444' }}
                >
                  List
                </button>
                <button onClick={() => navigate('executors')} style={{ background: '#444' }}>
                  Executors
                </button>
                <button onClick={() => navigate('create')}>
                  New Issue
                </button>
              </div>
            )}
            {view !== 'list' && view !== 'activity' && view !== 'dashboard' && (
              <button onClick={() => navigate('list')}>
                Back to List
              </button>
            )}
          </div>

          {dataLoading && <LoadingSkeleton />}

          {!dataLoading && view === 'list' && (
            <IssueList
              issues={issues}
              starredIds={starredIds}
              onEdit={(issue) => navigate('issue', issue)}
              onDelete={handleDeleteIssue}
              onToggleStar={handleToggleStar}
              onBulkUpdate={handleBulkUpdate}
              onCreateNew={() => navigate('create')}
            />
          )}

          {!dataLoading && view === 'activity' && (
            <ActivityFeed
              issues={issues}
              onIssueClick={(issue) => navigate('issue', issue)}
            />
          )}

          {!dataLoading && view === 'dashboard' && (
            <Dashboard issues={issues} />
          )}

          {!dataLoading && view === 'issue' && selectedIssue && (
            <IssueView
              issue={selectedIssue}
              onEdit={() => navigate('edit', selectedIssue)}
              onClose={() => navigate('list')}
              repoOwner={selectedRepo.owner}
              repoName={selectedRepo.name}
              currentUser={user}
              onCommentAdded={loadIssues}
            />
          )}

          {!dataLoading && (view === 'create' || view === 'edit') && (
            <IssueForm
              issue={selectedIssue}
              onSave={handleSaveIssue}
              onCancel={() => view === 'edit' && selectedIssue ? navigate('issue', selectedIssue) : navigate('list')}
            />
          )}
        </>
      )}
    </div>
  )
}
