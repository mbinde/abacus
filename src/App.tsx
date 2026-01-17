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
import ConflictResolver from './components/ConflictResolver'
import { apiFetch } from './lib/api'

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

// Three-way merge types (matching backend)
type EditableField = 'title' | 'description' | 'status' | 'priority' | 'issue_type' | 'assignee'

interface FieldConflict {
  field: EditableField
  baseValue: unknown
  localValue: unknown
  remoteValue: unknown
  remoteUpdatedAt: string
}

interface MergeResult {
  status: 'success' | 'auto_merged' | 'conflict'
  mergedIssue?: Issue
  autoMergedFields?: EditableField[]
  conflicts?: FieldConflict[]
  remoteIssue?: Issue
}

interface BaseState {
  issue: Issue
  fetchedAt: string
}

interface ConflictState {
  mergeResult: MergeResult
  localUpdates: Partial<Issue>
}

interface User {
  id: number
  login: string
  name: string | null
  avatarUrl: string
  role: 'admin' | 'premium' | 'user' | 'guest'
}

// Check if user can perform mutations (create, update, delete, comment)
function canMutate(user: User | null): boolean {
  if (!user) return false
  return user.role !== 'guest'
}

interface AppSettings {
  bulk_updates: 'enabled' | 'disabled'
  view_tree: 'enabled' | 'disabled'
  view_board: 'enabled' | 'disabled'
}

type View = 'list' | 'create' | 'edit' | 'issue' | 'admin' | 'profile' | 'executors' | 'activity' | 'dashboard'

interface AppState {
  view: View
  owner?: string
  repo?: string
  issueId?: string
}

// URL Structure:
// /                                    → Root (redirect to last repo or show picker)
// /:owner/:repo                        → Issue list for repo
// /:owner/:repo/issues                 → Same as above (alias)
// /:owner/:repo/issues/:issueId        → View single issue
// /:owner/:repo/issues/:issueId/edit   → Edit issue
// /:owner/:repo/new                    → Create new issue
// /:owner/:repo/activity               → Activity feed for repo
// /:owner/:repo/dashboard              → Dashboard for repo
// /:owner/:repo/executors              → Executor settings for repo
// /admin                               → Admin panel (global)
// /profile                             → User profile (global)

function parseUrlState(): AppState {
  const path = window.location.pathname

  // Global routes (no repo context)
  if (path === '/admin') {
    return { view: 'admin' }
  }
  if (path === '/profile') {
    return { view: 'profile' }
  }

  // Root path - no repo selected yet
  if (path === '/') {
    return { view: 'list' }
  }

  // Repo-scoped routes: /:owner/:repo/...
  const repoMatch = path.match(/^\/([^/]+)\/([^/]+)(?:\/(.*))?$/)
  if (repoMatch) {
    const [, owner, repo, rest] = repoMatch

    // /:owner/:repo or /:owner/:repo/issues
    if (!rest || rest === '' || rest === 'issues') {
      return { view: 'list', owner, repo }
    }

    // /:owner/:repo/new
    if (rest === 'new') {
      return { view: 'create', owner, repo }
    }

    // /:owner/:repo/activity
    if (rest === 'activity') {
      return { view: 'activity', owner, repo }
    }

    // /:owner/:repo/dashboard
    if (rest === 'dashboard') {
      return { view: 'dashboard', owner, repo }
    }

    // /:owner/:repo/executors
    if (rest === 'executors') {
      return { view: 'executors', owner, repo }
    }

    // Issue routes: issues/:id or issues/:id/edit
    const issueMatch = rest.match(/^issues\/([^/]+)(\/edit)?$/)
    if (issueMatch) {
      const issueId = issueMatch[1]
      const isEdit = !!issueMatch[2]
      return { view: isEdit ? 'edit' : 'issue', owner, repo, issueId }
    }
  }

  // Fallback - show list (will show repo picker if no repo)
  return { view: 'list' }
}

function buildUrl(state: AppState): string {
  // Global routes
  if (state.view === 'admin') return '/admin'
  if (state.view === 'profile') return '/profile'

  // Repo-scoped routes need owner/repo
  if (!state.owner || !state.repo) return '/'

  const base = `/${state.owner}/${state.repo}`

  switch (state.view) {
    case 'list':
      return base
    case 'create':
      return `${base}/new`
    case 'activity':
      return `${base}/activity`
    case 'dashboard':
      return `${base}/dashboard`
    case 'executors':
      return `${base}/executors`
    case 'issue':
      return `${base}/issues/${state.issueId}`
    case 'edit':
      return `${base}/issues/${state.issueId}/edit`
    default:
      return base
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
  const [appSettings, setAppSettings] = useState<AppSettings>({
    bulk_updates: 'enabled',
    view_tree: 'disabled',
    view_board: 'enabled',
  })
  // Three-way merge state
  const [editBaseState, setEditBaseState] = useState<BaseState | null>(null)
  const [conflictState, setConflictState] = useState<ConflictState | null>(null)
  // Pre-filled comment when converting from edit to comment
  const [initialComment, setInitialComment] = useState<string | null>(null)

  const isPopState = useRef(false)
  const pendingIssueId = useRef<string | null>(null)

  // Navigate with history support
  const navigate = useCallback((newView: View, issue?: Issue | null) => {
    const state: AppState = {
      view: newView,
      owner: selectedRepo?.owner,
      repo: selectedRepo?.name,
      issueId: issue?.id
    }
    const url = buildUrl(state)

    if (!isPopState.current) {
      window.history.pushState(state, '', url)
    }
    isPopState.current = false

    // Capture base state when entering edit mode
    if (newView === 'edit' && issue) {
      setEditBaseState({
        issue: { ...issue },
        fetchedAt: new Date().toISOString()
      })
    } else if (newView !== 'edit') {
      // Clear base state and conflict state when leaving edit mode
      setEditBaseState(null)
      setConflictState(null)
    }

    setView(newView)
    setSelectedIssue(issue ?? null)
  }, [selectedRepo])

  // Track URL state for repo syncing
  const pendingUrlState = useRef<AppState | null>(null)

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      isPopState.current = true
      const state = parseUrlState()
      setView(state.view)

      // Handle repo change from URL
      if (state.owner && state.repo) {
        const found = repos.find(r => r.owner === state.owner && r.name === state.repo)
        if (found && found !== selectedRepo) {
          setSelectedRepo(found)
        } else if (!found) {
          // Store for later - will try to add repo
          pendingUrlState.current = state
        }
      }

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
  }, [issues, repos, selectedRepo])

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
    // Log the full URL for debugging
    console.log('[Abacus] Initial URL:', window.location.href)
    console.log('[Abacus] Search params:', window.location.search)

    // IMPORTANT: Check for OAuth error FIRST, before rewriting URL
    const params = new URLSearchParams(window.location.search)
    const errorParam = params.get('error')
    if (errorParam) {
      const decodedError = decodeURIComponent(errorParam)
      console.log('[Abacus] Auth error from URL:', decodedError)
      setAuthError(decodedError)
    }

    const state = parseUrlState()
    setView(state.view)
    if (state.issueId) {
      pendingIssueId.current = state.issueId
    }
    // Store URL state for repo syncing after repos load
    if (state.owner && state.repo) {
      pendingUrlState.current = state
    }
    // Replace current history entry with state (this removes ?error= param)
    window.history.replaceState(state, '', buildUrl(state))

    checkAuth()
    loadAppSettings()
  }, [])

  async function loadAppSettings() {
    try {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const data = await res.json() as { settings: AppSettings }
        setAppSettings(data.settings)
      }
    } catch {
      // Use defaults on error
    }
  }

  useEffect(() => {
    if (user) {
      loadRepos()
    } else if (!loading) {
      // For anonymous users, check if anonymous access is enabled
      checkAnonymousAccess()
    }
  }, [user, loading])

  async function checkAnonymousAccess() {
    try {
      // Try to fetch demo repo issues - if 401, anonymous access is disabled
      const res = await fetch('/api/repos/steveyegge/beads/issues')
      if (res.ok) {
        // Anonymous access enabled - set up demo repo
        const demoRepo: Repo = {
          id: 0,
          owner: 'steveyegge',
          name: 'beads',
          webhook_configured: false,
          webhook_is_owner: false,
        }
        setRepos([demoRepo])
        setSelectedRepo(demoRepo)
      }
      // If 401, repos stay empty and Login page will show
    } catch {
      // Network error - repos stay empty
    }
  }

  // Views that need issues data
  const viewNeedsIssues = ['list', 'activity', 'dashboard', 'issue', 'create', 'edit'].includes(view)

  useEffect(() => {
    if (selectedRepo) {
      // Save selected repo to localStorage
      localStorage.setItem('abacus:selectedRepo', JSON.stringify({
        owner: selectedRepo.owner,
        name: selectedRepo.name,
      }))
      // Only load issues if current view needs them
      if (viewNeedsIssues) {
        loadIssues()
        loadStars()
      }
    }
  }, [selectedRepo, viewNeedsIssues])

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

        // Priority 1: URL has repo - use it (or auto-add if not in list)
        if (pendingUrlState.current?.owner && pendingUrlState.current?.repo) {
          const urlOwner = pendingUrlState.current.owner
          const urlRepo = pendingUrlState.current.repo
          const found = data.repos.find(r => r.owner === urlOwner && r.name === urlRepo)

          if (found) {
            setSelectedRepo(found)
            pendingUrlState.current = null
            return
          } else {
            // Repo not in user's list - try to auto-add it
            try {
              const addRes = await apiFetch('/api/repos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ owner: urlOwner, name: urlRepo }),
              })
              if (addRes.ok) {
                const addData = await addRes.json() as { repo: Repo }
                setRepos(prev => [...prev, addData.repo])
                setSelectedRepo(addData.repo)
                pendingUrlState.current = null
                return
              } else {
                const errData = await addRes.json() as { error?: string }
                setError(`Could not access ${urlOwner}/${urlRepo}: ${errData.error || 'Unknown error'}`)
              }
            } catch {
              setError(`Could not access ${urlOwner}/${urlRepo}`)
            }
            pendingUrlState.current = null
          }
        }

        // Priority 2: localStorage has saved repo
        if (data.repos.length > 0 && !selectedRepo) {
          const savedRepo = localStorage.getItem('abacus:selectedRepo')
          if (savedRepo) {
            const { owner, name } = JSON.parse(savedRepo)
            const found = data.repos.find(r => r.owner === owner && r.name === name)
            if (found) {
              // Update URL to reflect the selected repo
              const state: AppState = { view, owner: found.owner, repo: found.name }
              window.history.replaceState(state, '', buildUrl(state))
              setSelectedRepo(found)
              return
            }
          }
          // Fallback to first repo and update URL
          const first = data.repos[0]
          const state: AppState = { view, owner: first.owner, repo: first.name }
          window.history.replaceState(state, '', buildUrl(state))
          setSelectedRepo(first)
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
      const res = await apiFetch('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, name }),
      })
      if (res.ok) {
        const data = await res.json() as { repo: Repo }
        setRepos([...repos, data.repo])
        setSelectedRepo(data.repo)
        // Update URL to reflect the new repo
        const state: AppState = { view, owner: data.repo.owner, repo: data.repo.name }
        window.history.pushState(state, '', buildUrl(state))
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
      const res = await apiFetch(`/api/repos/${repoId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        const newRepos = repos.filter(r => r.id !== repoId)
        setRepos(newRepos)
        // If we removed the selected repo, select another one
        if (selectedRepo?.id === repoId) {
          if (newRepos.length > 0) {
            const first = newRepos[0]
            setSelectedRepo(first)
            localStorage.setItem('abacus:selectedRepo', JSON.stringify({
              owner: first.owner,
              name: first.name,
            }))
            // Update URL to new repo
            const state: AppState = { view, owner: first.owner, repo: first.name }
            window.history.pushState(state, '', buildUrl(state))
          } else {
            setSelectedRepo(null)
            localStorage.removeItem('abacus:selectedRepo')
            // Navigate to root when no repos left
            window.history.pushState({ view: 'list' }, '', '/')
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

  async function handleSaveIssue(
    issue: Partial<Issue>,
    backupFields?: { title?: string; description?: string }
  ) {
    if (!selectedRepo) return
    setDataLoading(true)
    setError(null)

    const isNew = !issue.id

    try {
      // Create backup comments FIRST (before conflict detection) if backup fields provided
      if (backupFields && issue.id && user) {
        const timestamp = new Date().toISOString()
        const backupPromises: Promise<Response>[] = []

        if (backupFields.title) {
          const commentText = `── backup: my edit to title ─────────────────────
Saved by ${user.login} in case of conflict
${timestamp}

${backupFields.title}
───────────────────────────────────────────────────`
          backupPromises.push(
            fetch(`/api/repos/${selectedRepo.owner}/${selectedRepo.name}/issues/${issue.id}/comments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: commentText }),
            })
          )
        }

        if (backupFields.description) {
          const commentText = `── backup: my edit to description ─────────────────────
Saved by ${user.login} in case of conflict
${timestamp}

${backupFields.description}
───────────────────────────────────────────────────`
          backupPromises.push(
            fetch(`/api/repos/${selectedRepo.owner}/${selectedRepo.name}/issues/${issue.id}/comments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: commentText }),
            })
          )
        }

        // Wait for backup comments to be created
        await Promise.all(backupPromises)
      }

      // Now save the issue
      const url = isNew
        ? `/api/repos/${selectedRepo.owner}/${selectedRepo.name}/issues`
        : `/api/repos/${selectedRepo.owner}/${selectedRepo.name}/issues/${issue.id}`

      // Build request body: new format for updates (with baseState), old format for create
      const requestBody = isNew
        ? issue
        : {
            updates: issue,
            baseState: editBaseState
          }

      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const data = await res.json() as {
        success?: boolean
        error?: string
        conflict?: boolean
        mergeResult?: MergeResult
      }

      if (res.ok) {
        // Check for auto-merge notification
        if (data.mergeResult?.status === 'auto_merged' && data.mergeResult.autoMergedFields?.length) {
          // Show brief notification that some fields were auto-merged
          console.log('Auto-merged fields:', data.mergeResult.autoMergedFields)
        }

        setEditBaseState(null)
        setConflictState(null)
        await loadIssues()
        navigate('list')
      } else if (res.status === 409 && data.conflict && data.mergeResult?.status === 'conflict') {
        // True conflict - show resolution UI
        // Note: backup comments were already created above, so user's work is safe
        setConflictState({
          mergeResult: data.mergeResult,
          localUpdates: issue
        })
      } else {
        setError(data.error || 'Failed to save issue')
      }
    } catch {
      setError('Failed to save issue')
    } finally {
      setDataLoading(false)
    }
  }

  // Conflict resolution handlers
  async function handleResolveConflict(resolutions: Record<EditableField, 'local' | 'remote'>) {
    if (!conflictState || !selectedRepo || !selectedIssue) return

    const { mergeResult } = conflictState

    // Build resolved issue from mergedIssue (non-conflicting) + user's resolutions
    const resolvedIssue: Partial<Issue> = {
      ...mergeResult.mergedIssue,
      id: selectedIssue.id
    }

    // Apply user's choices for conflicting fields
    for (const conflict of mergeResult.conflicts || []) {
      const choice = resolutions[conflict.field]
      if (choice === 'local') {
        (resolvedIssue as Record<string, unknown>)[conflict.field] = conflict.localValue
      } else {
        (resolvedIssue as Record<string, unknown>)[conflict.field] = conflict.remoteValue
      }
    }

    // Update base state to the remote issue we just saw (for next potential conflict)
    if (mergeResult.remoteIssue) {
      setEditBaseState({
        issue: mergeResult.remoteIssue as Issue,
        fetchedAt: new Date().toISOString()
      })
    }
    setConflictState(null)

    // Re-save with resolved values
    await handleSaveIssue(resolvedIssue)
  }

  function handleDiscardLocalChanges() {
    setConflictState(null)
    setEditBaseState(null)
    loadIssues()
    navigate('list')
  }

  function handleConvertToComment(commentText: string) {
    // Navigate to issue view with pre-filled comment
    setInitialComment(commentText)
    setEditBaseState(null)
    setConflictState(null)
    if (selectedIssue) {
      navigate('issue', selectedIssue)
    }
  }

  // Clear initialComment when navigating away from issue view
  useEffect(() => {
    if (view !== 'issue' && initialComment) {
      setInitialComment(null)
    }
  }, [view, initialComment])

  async function handleForceLocalChanges() {
    if (!conflictState) return

    // Clear base state to trigger "no base state" path (last-write-wins)
    setEditBaseState(null)
    setConflictState(null)

    // Re-save without base state
    await handleSaveIssue(conflictState.localUpdates)
  }

  async function handleBulkUpdate(issueIds: string[], updates: { status?: string; priority?: number }) {
    if (!selectedRepo) return
    setDataLoading(true)
    setError(null)

    try {
      const res = await apiFetch(`/api/repos/${selectedRepo.owner}/${selectedRepo.name}/issues/bulk`, {
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
      const res = await apiFetch(`/api/repos/${selectedRepo.owner}/${selectedRepo.name}/issues/${id}`, {
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
    await apiFetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    setRepos([])
    setSelectedRepo(null)
    setIssues([])
    // Navigate to root on logout
    window.history.pushState({ view: 'list' }, '', '/')
  }

  // Handle repo selection - updates both state and URL
  function handleSelectRepo(repo: Repo) {
    setSelectedRepo(repo)
    // Update URL to reflect new repo selection
    const state: AppState = { view, owner: repo.owner, repo: repo.name }
    window.history.pushState(state, '', buildUrl(state))
  }

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  // Determine if user can mutate (for hiding controls)
  const readOnly = !canMutate(user)

  // Admin panel view - requires auth and admin role
  if (view === 'admin') {
    if (!user) {
      return <Login error={authError} />
    }
    return (
      <div className="container">
        <Header user={user} onNavigate={navigate} onLogout={handleLogout} />
        <AdminPanel onBack={() => navigate('list')} />
      </div>
    )
  }

  // Profile view - requires auth
  if (view === 'profile') {
    if (!user) {
      return <Login error={authError} />
    }
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

  // Executors view - requires auth
  if (view === 'executors' && selectedRepo) {
    if (!user) {
      return <Login error={authError} />
    }
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

  // Create/edit views - require mutation permissions
  if ((view === 'create' || view === 'edit') && readOnly) {
    return <Login error={authError || (user ? 'Guest users cannot create or edit issues' : null)} />
  }

  // No user and no repos means anonymous access is disabled
  if (!user && repos.length === 0) {
    return <Login error={authError} />
  }

  return (
    <div className="container">
      <Header user={user} onNavigate={navigate} onLogout={handleLogout} />

      {(view === 'list' || view === 'activity' || view === 'dashboard') ? (
        <RepoSelector
          repos={repos}
          selected={selectedRepo}
          onSelect={handleSelectRepo}
          onAdd={handleAddRepo}
          readOnly={!user}
        />
      ) : selectedRepo && (
        <div style={{ padding: '0.5rem 0', color: '#888', fontSize: '0.9rem' }}>
          {selectedRepo.owner}/{selectedRepo.name}
        </div>
      )}

      {authError && <div className="error">{authError}</div>}
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
                  onClick={() => navigate('list')}
                  style={{ background: view === 'list' ? '#0077cc' : '#444' }}
                >
                  List
                </button>
                <button
                  onClick={() => navigate('activity')}
                  style={{ background: view === 'activity' ? '#0077cc' : '#444' }}
                >
                  Activity
                </button>
                {!readOnly && (
                  <>
                    <button onClick={() => navigate('executors')} style={{ background: '#444' }}>
                      Executors
                    </button>
                    <button onClick={() => navigate('create')}>
                      New Issue
                    </button>
                  </>
                )}
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
              repoKey={selectedRepo ? `${selectedRepo.owner}/${selectedRepo.name}` : undefined}
              onEdit={(issue) => navigate('issue', issue)}
              onDelete={handleDeleteIssue}
              onToggleStar={handleToggleStar}
              onBulkUpdate={appSettings.bulk_updates === 'enabled' ? handleBulkUpdate : undefined}
              onCreateNew={() => navigate('create')}
              readOnly={readOnly}
              showTreeView={appSettings.view_tree === 'enabled'}
              showBoardView={appSettings.view_board === 'enabled'}
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
              readOnly={readOnly}
              initialComment={initialComment || undefined}
            />
          )}

          {!dataLoading && (view === 'create' || view === 'edit') && !conflictState && (
            <IssueForm
              issue={selectedIssue}
              onSave={handleSaveIssue}
              onCancel={() => view === 'edit' && selectedIssue ? navigate('issue', selectedIssue) : navigate('list')}
              onConvertToComment={view === 'edit' ? handleConvertToComment : undefined}
            />
          )}

          {/* Conflict resolution UI */}
          {conflictState && (
            <ConflictResolver
              conflicts={conflictState.mergeResult.conflicts || []}
              autoMergedFields={conflictState.mergeResult.autoMergedFields || []}
              onResolve={handleResolveConflict}
              onDiscardLocal={handleDiscardLocalChanges}
              onForceLocal={handleForceLocalChanges}
              onCancel={() => setConflictState(null)}
            />
          )}
        </>
      )}
    </div>
  )
}
