import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import IssueList from './IssueList'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock scrollIntoView for jsdom
Element.prototype.scrollIntoView = vi.fn()

// Test data factory
function createIssue(overrides: Partial<Parameters<typeof createIssueWithDefaults>[0]> = {}) {
  return createIssueWithDefaults(overrides)
}

function createIssueWithDefaults({
  id = `test-${Math.random().toString(36).substring(2, 5)}`,
  title = 'Test Issue',
  description,
  status = 'open' as const,
  priority = 2,
  issue_type = 'task' as const,
  assignee,
  created_at = '2026-01-01T00:00:00Z',
  updated_at,
  parent,
}: {
  id?: string
  title?: string
  description?: string
  status?: 'open' | 'closed' | 'in_progress'
  priority?: number
  issue_type?: 'bug' | 'feature' | 'task' | 'epic'
  assignee?: string
  created_at?: string
  updated_at?: string
  parent?: string
} = {}) {
  return {
    id,
    title,
    description,
    status,
    priority,
    issue_type,
    assignee,
    created_at,
    updated_at,
    parent,
  }
}

describe('IssueList', () => {
  const defaultProps = {
    issues: [] as ReturnType<typeof createIssue>[],
    starredIds: new Set<string>(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggleStar: vi.fn(),
  }

  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('empty state', () => {
    it('shows empty state when no issues', () => {
      render(<IssueList {...defaultProps} issues={[]} />)

      expect(screen.getByText('No issues yet')).toBeInTheDocument()
    })

    it('shows create action when onCreateNew provided', () => {
      const onCreateNew = vi.fn()
      render(<IssueList {...defaultProps} issues={[]} onCreateNew={onCreateNew} />)

      const createButton = screen.getByText('Create Issue')
      fireEvent.click(createButton)

      expect(onCreateNew).toHaveBeenCalled()
    })
  })

  describe('basic rendering', () => {
    it('renders issues in a table', () => {
      const issues = [
        createIssue({ id: 'test-1', title: 'First Issue' }),
        createIssue({ id: 'test-2', title: 'Second Issue' }),
      ]

      render(<IssueList {...defaultProps} issues={issues} />)

      expect(screen.getByText('First Issue')).toBeInTheDocument()
      expect(screen.getByText('Second Issue')).toBeInTheDocument()
      expect(screen.getByText('test-1')).toBeInTheDocument()
      expect(screen.getByText('test-2')).toBeInTheDocument()
    })

    it('displays issue type badge', () => {
      const issues = [createIssue({ issue_type: 'bug' })]

      render(<IssueList {...defaultProps} issues={issues} />)

      expect(screen.getByText('bug')).toBeInTheDocument()
    })

    it('displays status badge', () => {
      const issues = [createIssue({ status: 'in_progress' })]

      render(<IssueList {...defaultProps} issues={issues} />)

      // Need to switch to All or In Progress filter to see in_progress issues
      fireEvent.click(screen.getByText(/In Progress/))

      expect(screen.getByText('in progress')).toBeInTheDocument()
    })

    it('displays assignee when present', () => {
      const issues = [createIssue({ assignee: 'alice' })]

      render(<IssueList {...defaultProps} issues={issues} />)

      expect(screen.getByText('@alice')).toBeInTheDocument()
    })

    it('calls onEdit when issue title clicked', () => {
      const onEdit = vi.fn()
      const issues = [createIssue({ title: 'Click me', status: 'open' })]

      render(<IssueList {...defaultProps} issues={issues} onEdit={onEdit} />)

      // Issue is open, so visible by default
      fireEvent.click(screen.getByText('Click me'))

      expect(onEdit).toHaveBeenCalledWith(issues[0])
    })
  })

  describe('status filtering', () => {
    const mixedIssues = [
      createIssue({ id: 'open-1', title: 'Open Issue', status: 'open' }),
      createIssue({ id: 'progress-1', title: 'In Progress Issue', status: 'in_progress' }),
      createIssue({ id: 'closed-1', title: 'Closed Issue', status: 'closed' }),
    ]

    it('defaults to open filter', () => {
      render(<IssueList {...defaultProps} issues={mixedIssues} />)

      expect(screen.getByText('Open Issue')).toBeInTheDocument()
      expect(screen.queryByText('In Progress Issue')).not.toBeInTheDocument()
      expect(screen.queryByText('Closed Issue')).not.toBeInTheDocument()
    })

    it('shows all issues when All filter selected', () => {
      render(<IssueList {...defaultProps} issues={mixedIssues} />)

      fireEvent.click(screen.getByText(/^All/))

      expect(screen.getByText('Open Issue')).toBeInTheDocument()
      expect(screen.getByText('In Progress Issue')).toBeInTheDocument()
      expect(screen.getByText('Closed Issue')).toBeInTheDocument()
    })

    it('filters by in_progress status', () => {
      render(<IssueList {...defaultProps} issues={mixedIssues} />)

      fireEvent.click(screen.getByText(/In Progress/))

      expect(screen.queryByText('Open Issue')).not.toBeInTheDocument()
      expect(screen.getByText('In Progress Issue')).toBeInTheDocument()
      expect(screen.queryByText('Closed Issue')).not.toBeInTheDocument()
    })

    it('filters by closed status', () => {
      render(<IssueList {...defaultProps} issues={mixedIssues} />)

      fireEvent.click(screen.getByText(/Closed/))

      expect(screen.queryByText('Open Issue')).not.toBeInTheDocument()
      expect(screen.queryByText('In Progress Issue')).not.toBeInTheDocument()
      expect(screen.getByText('Closed Issue')).toBeInTheDocument()
    })

    it('displays issue counts in filter buttons', () => {
      render(<IssueList {...defaultProps} issues={mixedIssues} />)

      expect(screen.getByText('All (3)')).toBeInTheDocument()
      expect(screen.getByText('Open (1)')).toBeInTheDocument()
      expect(screen.getByText('In Progress (1)')).toBeInTheDocument()
      expect(screen.getByText('Closed (1)')).toBeInTheDocument()
    })

    it('persists filter selection to localStorage (per-repo)', () => {
      render(<IssueList {...defaultProps} issues={mixedIssues} repoKey="owner/repo" />)

      fireEvent.click(screen.getByText(/Closed/))

      expect(localStorageMock.getItem('abacus:repo:owner/repo:statusFilter')).toBe('closed')
    })

    it('restores filter from localStorage (per-repo)', () => {
      localStorageMock.setItem('abacus:repo:owner/repo:statusFilter', 'closed')

      render(<IssueList {...defaultProps} issues={mixedIssues} repoKey="owner/repo" />)

      // Closed filter should be active, showing only closed issue
      expect(screen.queryByText('Open Issue')).not.toBeInTheDocument()
      expect(screen.getByText('Closed Issue')).toBeInTheDocument()
    })

    it('uses different storage keys for different repos', () => {
      localStorageMock.setItem('abacus:repo:owner/repo-a:statusFilter', 'closed')
      localStorageMock.setItem('abacus:repo:owner/repo-b:statusFilter', 'in_progress')

      const { rerender } = render(<IssueList {...defaultProps} issues={mixedIssues} repoKey="owner/repo-a" />)

      // Repo A should show closed filter
      expect(screen.queryByText('Open Issue')).not.toBeInTheDocument()
      expect(screen.getByText('Closed Issue')).toBeInTheDocument()

      rerender(<IssueList {...defaultProps} issues={mixedIssues} repoKey="owner/repo-b" />)

      // Repo B should show in_progress filter
      expect(screen.queryByText('Open Issue')).not.toBeInTheDocument()
      expect(screen.getByText('In Progress Issue')).toBeInTheDocument()
    })
  })

  describe('starred filtering', () => {
    it('filters to show only starred issues', () => {
      const issues = [
        createIssue({ id: 'starred-1', title: 'Starred Issue' }),
        createIssue({ id: 'unstarred-1', title: 'Unstarred Issue' }),
      ]
      const starredIds = new Set(['starred-1'])

      render(<IssueList {...defaultProps} issues={issues} starredIds={starredIds} />)

      fireEvent.click(screen.getByText(/★ Starred/))

      expect(screen.getByText('Starred Issue')).toBeInTheDocument()
      expect(screen.queryByText('Unstarred Issue')).not.toBeInTheDocument()
    })

    it('shows empty state when no starred issues', () => {
      const issues = [createIssue({ title: 'Some Issue' })]

      render(<IssueList {...defaultProps} issues={issues} starredIds={new Set()} />)

      fireEvent.click(screen.getByText(/★ Starred/))

      expect(screen.getByText('No starred issues')).toBeInTheDocument()
    })

    it('displays starred count', () => {
      const issues = [
        createIssue({ id: 'a' }),
        createIssue({ id: 'b' }),
        createIssue({ id: 'c' }),
      ]
      const starredIds = new Set(['a', 'c'])

      render(<IssueList {...defaultProps} issues={issues} starredIds={starredIds} />)

      expect(screen.getByText('★ Starred (2)')).toBeInTheDocument()
    })
  })

  describe('star toggle', () => {
    it('displays star button for each issue', () => {
      const issues = [createIssue({ id: 'test-1' })]

      render(<IssueList {...defaultProps} issues={issues} />)

      expect(screen.getByTitle('Star issue')).toBeInTheDocument()
    })

    it('shows filled star for starred issues', () => {
      const issues = [createIssue({ id: 'test-1' })]
      const starredIds = new Set(['test-1'])

      render(<IssueList {...defaultProps} issues={issues} starredIds={starredIds} />)

      const unstarButton = screen.getByTitle('Unstar issue')
      expect(unstarButton).toBeInTheDocument()
      // The star button should contain the filled star character
      expect(unstarButton.textContent).toBe('★')
    })

    it('calls onToggleStar when star clicked', () => {
      const onToggleStar = vi.fn()
      const issues = [createIssue({ id: 'test-1' })]

      render(<IssueList {...defaultProps} issues={issues} onToggleStar={onToggleStar} />)

      fireEvent.click(screen.getByTitle('Star issue'))

      expect(onToggleStar).toHaveBeenCalledWith('test-1', true)
    })

    it('calls onToggleStar with false when unstarring', () => {
      const onToggleStar = vi.fn()
      const issues = [createIssue({ id: 'test-1' })]
      const starredIds = new Set(['test-1'])

      render(<IssueList {...defaultProps} issues={issues} starredIds={starredIds} onToggleStar={onToggleStar} />)

      fireEvent.click(screen.getByTitle('Unstar issue'))

      expect(onToggleStar).toHaveBeenCalledWith('test-1', false)
    })
  })

  describe('search', () => {
    const searchableIssues = [
      createIssue({ id: 'bug-123', title: 'Fix login bug', description: 'Users cannot login' }),
      createIssue({ id: 'feat-456', title: 'Add dark mode', description: 'Theme support' }),
      createIssue({ id: 'task-789', title: 'Update docs' }),
    ]

    it('filters issues by title', () => {
      render(<IssueList {...defaultProps} issues={searchableIssues} />)

      // Switch to All first
      fireEvent.click(screen.getByText(/^All/))

      const searchInput = screen.getByPlaceholderText(/Search issues/)
      fireEvent.change(searchInput, { target: { value: 'login' } })

      expect(screen.getByText('Fix login bug')).toBeInTheDocument()
      expect(screen.queryByText('Add dark mode')).not.toBeInTheDocument()
      expect(screen.queryByText('Update docs')).not.toBeInTheDocument()
    })

    it('filters issues by ID', () => {
      render(<IssueList {...defaultProps} issues={searchableIssues} />)

      fireEvent.click(screen.getByText(/^All/))

      const searchInput = screen.getByPlaceholderText(/Search issues/)
      fireEvent.change(searchInput, { target: { value: 'feat-456' } })

      expect(screen.queryByText('Fix login bug')).not.toBeInTheDocument()
      expect(screen.getByText('Add dark mode')).toBeInTheDocument()
    })

    it('filters issues by description', () => {
      render(<IssueList {...defaultProps} issues={searchableIssues} />)

      fireEvent.click(screen.getByText(/^All/))

      const searchInput = screen.getByPlaceholderText(/Search issues/)
      fireEvent.change(searchInput, { target: { value: 'theme' } })

      expect(screen.queryByText('Fix login bug')).not.toBeInTheDocument()
      expect(screen.getByText('Add dark mode')).toBeInTheDocument()
    })

    it('search is case-insensitive', () => {
      render(<IssueList {...defaultProps} issues={searchableIssues} />)

      fireEvent.click(screen.getByText(/^All/))

      const searchInput = screen.getByPlaceholderText(/Search issues/)
      fireEvent.change(searchInput, { target: { value: 'LOGIN' } })

      expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    })

    it('shows search empty state when no results', () => {
      render(<IssueList {...defaultProps} issues={searchableIssues} />)

      fireEvent.click(screen.getByText(/^All/))

      const searchInput = screen.getByPlaceholderText(/Search issues/)
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } })

      expect(screen.getByText('No results found')).toBeInTheDocument()
    })
  })

  describe('sorting', () => {
    const sortableIssues = [
      createIssue({ id: 'a-1', title: 'Alpha', priority: 3, updated_at: '2026-01-03T00:00:00Z' }),
      createIssue({ id: 'b-2', title: 'Beta', priority: 1, updated_at: '2026-01-01T00:00:00Z' }),
      createIssue({ id: 'c-3', title: 'Gamma', priority: 2, updated_at: '2026-01-02T00:00:00Z' }),
    ]

    it('sorts by priority by default (ascending)', () => {
      render(<IssueList {...defaultProps} issues={sortableIssues} />)

      fireEvent.click(screen.getByText(/^All/))

      const rows = screen.getAllByRole('row').slice(1) // Skip header
      expect(within(rows[0]).getByText('Beta')).toBeInTheDocument() // P1
      expect(within(rows[1]).getByText('Gamma')).toBeInTheDocument() // P2
      expect(within(rows[2]).getByText('Alpha')).toBeInTheDocument() // P3
    })

    it('toggles sort direction when clicking same column', () => {
      render(<IssueList {...defaultProps} issues={sortableIssues} />)

      fireEvent.click(screen.getByText(/^All/))

      // Click Priority header to toggle to descending
      fireEvent.click(screen.getByText(/Priority/))

      const rows = screen.getAllByRole('row').slice(1)
      expect(within(rows[0]).getByText('Alpha')).toBeInTheDocument() // P3 first in desc
    })

    it('sorts by title', () => {
      render(<IssueList {...defaultProps} issues={sortableIssues} />)

      fireEvent.click(screen.getByText(/^All/))
      fireEvent.click(screen.getByText('Title'))

      const rows = screen.getAllByRole('row').slice(1)
      expect(within(rows[0]).getByText('Alpha')).toBeInTheDocument()
      expect(within(rows[1]).getByText('Beta')).toBeInTheDocument()
      expect(within(rows[2]).getByText('Gamma')).toBeInTheDocument()
    })

    it('sorts by ID', () => {
      render(<IssueList {...defaultProps} issues={sortableIssues} />)

      fireEvent.click(screen.getByText(/^All/))
      fireEvent.click(screen.getByText('ID'))

      const rows = screen.getAllByRole('row').slice(1)
      expect(within(rows[0]).getByText('a-1')).toBeInTheDocument()
      expect(within(rows[1]).getByText('b-2')).toBeInTheDocument()
      expect(within(rows[2]).getByText('c-3')).toBeInTheDocument()
    })

    it('displays sort indicator', () => {
      render(<IssueList {...defaultProps} issues={sortableIssues} />)

      // Default sort is priority ascending
      expect(screen.getByText('Priority ▲')).toBeInTheDocument()

      // Click to toggle to descending
      fireEvent.click(screen.getByText('Priority ▲'))
      expect(screen.getByText('Priority ▼')).toBeInTheDocument()
    })

    it('persists sort selection to localStorage (per-repo)', () => {
      render(<IssueList {...defaultProps} issues={sortableIssues} repoKey="owner/repo" />)

      fireEvent.click(screen.getByText(/^All/))
      fireEvent.click(screen.getByText('Title'))

      expect(localStorageMock.getItem('abacus:repo:owner/repo:sortKey')).toBe('title')
      expect(localStorageMock.getItem('abacus:repo:owner/repo:sortDir')).toBe('asc')

      // Click again to toggle direction
      fireEvent.click(screen.getByText('Title ▲'))
      expect(localStorageMock.getItem('abacus:repo:owner/repo:sortDir')).toBe('desc')
    })

    it('restores sort from localStorage (per-repo)', () => {
      localStorageMock.setItem('abacus:repo:owner/repo:sortKey', 'title')
      localStorageMock.setItem('abacus:repo:owner/repo:sortDir', 'asc')

      render(<IssueList {...defaultProps} issues={sortableIssues} repoKey="owner/repo" />)

      fireEvent.click(screen.getByText(/^All/))

      // Should show title sort indicator
      expect(screen.getByText('Title ▲')).toBeInTheDocument()

      // Issues should be sorted by title ascending
      const rows = screen.getAllByRole('row').slice(1)
      expect(within(rows[0]).getByText('Alpha')).toBeInTheDocument()
      expect(within(rows[1]).getByText('Beta')).toBeInTheDocument()
      expect(within(rows[2]).getByText('Gamma')).toBeInTheDocument()
    })

    it('uses different sort settings for different repos', () => {
      localStorageMock.setItem('abacus:repo:owner/repo-a:sortKey', 'title')
      localStorageMock.setItem('abacus:repo:owner/repo-a:sortDir', 'asc')
      localStorageMock.setItem('abacus:repo:owner/repo-b:sortKey', 'priority')
      localStorageMock.setItem('abacus:repo:owner/repo-b:sortDir', 'desc')

      const { rerender } = render(<IssueList {...defaultProps} issues={sortableIssues} repoKey="owner/repo-a" />)

      fireEvent.click(screen.getByText(/^All/))

      // Repo A: sorted by title ascending
      expect(screen.getByText('Title ▲')).toBeInTheDocument()

      rerender(<IssueList {...defaultProps} issues={sortableIssues} repoKey="owner/repo-b" />)

      // Repo B: sorted by priority descending
      expect(screen.getByText('Priority ▼')).toBeInTheDocument()
    })
  })

  describe('bulk selection', () => {
    const bulkIssues = [
      createIssue({ id: 'issue-1', title: 'Issue 1' }),
      createIssue({ id: 'issue-2', title: 'Issue 2' }),
      createIssue({ id: 'issue-3', title: 'Issue 3' }),
    ]

    it('shows checkboxes when onBulkUpdate provided', () => {
      const onBulkUpdate = vi.fn()

      render(<IssueList {...defaultProps} issues={bulkIssues} onBulkUpdate={onBulkUpdate} />)

      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes.length).toBeGreaterThan(0)
    })

    it('hides checkboxes when onBulkUpdate not provided', () => {
      render(<IssueList {...defaultProps} issues={bulkIssues} />)

      expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    })

    it('hides checkboxes in readOnly mode', () => {
      const onBulkUpdate = vi.fn()

      render(<IssueList {...defaultProps} issues={bulkIssues} onBulkUpdate={onBulkUpdate} readOnly />)

      expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    })

    it('shows bulk actions bar when items selected', () => {
      const onBulkUpdate = vi.fn()

      render(<IssueList {...defaultProps} issues={bulkIssues} onBulkUpdate={onBulkUpdate} />)

      // Check first issue
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[1]) // First issue checkbox (index 0 is "select all")

      expect(screen.getByText('1 selected')).toBeInTheDocument()
    })

    it('select all checkbox selects all visible issues', () => {
      const onBulkUpdate = vi.fn()

      render(<IssueList {...defaultProps} issues={bulkIssues} onBulkUpdate={onBulkUpdate} />)

      fireEvent.click(screen.getByText(/^All/)) // Show all issues

      const selectAllCheckbox = screen.getByTitle('Select all')
      fireEvent.click(selectAllCheckbox)

      expect(screen.getByText('3 selected')).toBeInTheDocument()
    })

    it('calls onBulkUpdate with selected IDs when Close clicked', async () => {
      const onBulkUpdate = vi.fn().mockResolvedValue(undefined)

      render(<IssueList {...defaultProps} issues={bulkIssues} onBulkUpdate={onBulkUpdate} />)

      // Select issues
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[1])
      fireEvent.click(checkboxes[2])

      // Click Close button
      fireEvent.click(screen.getByText('Close'))

      expect(onBulkUpdate).toHaveBeenCalledWith(
        expect.arrayContaining(['issue-1', 'issue-2']),
        { status: 'closed' }
      )
    })

    it('clears selection after bulk action', async () => {
      const onBulkUpdate = vi.fn().mockResolvedValue(undefined)

      render(<IssueList {...defaultProps} issues={bulkIssues} onBulkUpdate={onBulkUpdate} />)

      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[1])

      fireEvent.click(screen.getByText('Close'))

      // Wait for promise to resolve
      await vi.waitFor(() => {
        expect(screen.queryByText('1 selected')).not.toBeInTheDocument()
      })
    })

    it('Clear button deselects all', () => {
      const onBulkUpdate = vi.fn()

      render(<IssueList {...defaultProps} issues={bulkIssues} onBulkUpdate={onBulkUpdate} />)

      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[1])
      fireEvent.click(checkboxes[2])

      expect(screen.getByText('2 selected')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Clear'))

      expect(screen.queryByText('2 selected')).not.toBeInTheDocument()
    })
  })

  describe('priority display', () => {
    it('displays priority labels', () => {
      const issues = [
        createIssue({ priority: 1 }),
        createIssue({ priority: 2 }),
        createIssue({ priority: 3 }),
        createIssue({ priority: 4 }),
      ]

      render(<IssueList {...defaultProps} issues={issues} />)

      fireEvent.click(screen.getByText(/^All/))

      expect(screen.getByText('Critical')).toBeInTheDocument()
      expect(screen.getByText('High')).toBeInTheDocument()
      expect(screen.getByText('Medium')).toBeInTheDocument()
      expect(screen.getByText('Low')).toBeInTheDocument()
    })
  })

  describe('tree view', () => {
    it('organizes issues by parent-child relationships', () => {
      const issues = [
        createIssue({ id: 'epic-1', title: 'Epic', issue_type: 'epic', priority: 1 }),
        createIssue({ id: 'child-1', title: 'Child Task', parent: 'epic-1', priority: 2 }),
        createIssue({ id: 'standalone', title: 'Standalone', priority: 1 }),
      ]

      // showTreeView must be true for tree button to appear
      render(<IssueList {...defaultProps} issues={issues} showTreeView={true} />)

      fireEvent.click(screen.getByText(/🌳 Tree/))

      // All issues should be visible
      expect(screen.getByText('Epic')).toBeInTheDocument()
      expect(screen.getByText('Child Task')).toBeInTheDocument()
      expect(screen.getByText('Standalone')).toBeInTheDocument()
    })
  })

  describe('keyboard navigation', () => {
    const navIssues = [
      createIssue({ id: 'nav-1', title: 'First' }),
      createIssue({ id: 'nav-2', title: 'Second' }),
      createIssue({ id: 'nav-3', title: 'Third' }),
    ]

    it('j key moves selection down', () => {
      render(<IssueList {...defaultProps} issues={navIssues} />)

      fireEvent.click(screen.getByText(/^All/))

      // Press j to select first
      fireEvent.keyDown(document, { key: 'j' })

      // First row should be selected (has highlight styling)
      const rows = screen.getAllByRole('row').slice(1)
      expect(rows[0]).toHaveStyle({ background: '#1e3a5f' })
    })

    it('k key moves selection up', () => {
      render(<IssueList {...defaultProps} issues={navIssues} />)

      fireEvent.click(screen.getByText(/^All/))

      // Press j twice then k
      fireEvent.keyDown(document, { key: 'j' })
      fireEvent.keyDown(document, { key: 'j' })
      fireEvent.keyDown(document, { key: 'k' })

      const rows = screen.getAllByRole('row').slice(1)
      expect(rows[0]).toHaveStyle({ background: '#1e3a5f' })
    })

    it('/ key focuses search input', () => {
      render(<IssueList {...defaultProps} issues={navIssues} />)

      fireEvent.keyDown(document, { key: '/' })

      expect(screen.getByPlaceholderText(/Search issues/)).toHaveFocus()
    })

    it('? key toggles help modal', () => {
      render(<IssueList {...defaultProps} issues={navIssues} />)

      fireEvent.keyDown(document, { key: '?' })

      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
    })

    it('Escape closes help modal', () => {
      render(<IssueList {...defaultProps} issues={navIssues} />)

      fireEvent.keyDown(document, { key: '?' })
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()

      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument()
    })

    it('e key calls onEdit for selected issue', () => {
      const onEdit = vi.fn()
      render(<IssueList {...defaultProps} issues={navIssues} onEdit={onEdit} />)

      fireEvent.click(screen.getByText(/^All/))

      // Select first issue
      fireEvent.keyDown(document, { key: 'j' })
      // Press e to edit
      fireEvent.keyDown(document, { key: 'e' })

      expect(onEdit).toHaveBeenCalledWith(navIssues[0])
    })

    it('s key toggles star for selected issue', () => {
      const onToggleStar = vi.fn()
      render(<IssueList {...defaultProps} issues={navIssues} onToggleStar={onToggleStar} />)

      fireEvent.click(screen.getByText(/^All/))

      fireEvent.keyDown(document, { key: 'j' })
      fireEvent.keyDown(document, { key: 's' })

      expect(onToggleStar).toHaveBeenCalledWith('nav-1', true)
    })
  })

  describe('help modal', () => {
    it('shows keyboard shortcuts', () => {
      const issues = [createIssue()]

      render(<IssueList {...defaultProps} issues={issues} />)

      fireEvent.click(screen.getByTitle('Keyboard shortcuts'))

      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
      expect(screen.getByText('Move down')).toBeInTheDocument()
      expect(screen.getByText('Move up')).toBeInTheDocument()
      expect(screen.getByText('Edit selected issue')).toBeInTheDocument()
    })

    it('closes when clicking backdrop', () => {
      const issues = [createIssue()]

      render(<IssueList {...defaultProps} issues={issues} />)

      fireEvent.click(screen.getByTitle('Keyboard shortcuts'))
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()

      // Click the backdrop (the outer div with rgba background)
      const backdrop = screen.getByText('Keyboard Shortcuts').closest('div')!.parentElement!
      fireEvent.click(backdrop)

      expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument()
    })
  })
})
