import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import IssueForm from './IssueForm'

// Helper to create test issues
function createIssue(overrides: Partial<{
  id: string
  title: string
  description: string
  status: 'open' | 'closed' | 'in_progress'
  priority: number
  issue_type: 'bug' | 'feature' | 'task' | 'epic'
  assignee: string
  created_at: string
  updated_at: string
  sha: string
  links: Array<{ type: 'pr' | 'commit' | 'issue'; url: string; number?: number; sha?: string; title?: string }>
}> = {}) {
  return {
    id: overrides.id ?? 'test-123',
    title: overrides.title ?? 'Test Issue',
    description: overrides.description,
    status: overrides.status ?? 'open',
    priority: overrides.priority ?? 3,
    issue_type: overrides.issue_type ?? 'task',
    assignee: overrides.assignee,
    created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
    updated_at: overrides.updated_at,
    sha: overrides.sha,
    links: overrides.links,
  }
}

describe('IssueForm', () => {
  const mockOnSave = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Helper to get select element by its preceding label text
  function getSelectByLabel(container: HTMLElement, labelText: string): HTMLSelectElement {
    const labels = container.querySelectorAll('label')
    for (const label of labels) {
      if (label.textContent === labelText) {
        // The select is the next sibling element
        const select = label.parentElement?.querySelector('select')
        if (select) return select as HTMLSelectElement
      }
    }
    throw new Error(`Could not find select for label: ${labelText}`)
  }

  describe('create mode', () => {
    it('shows "Create Issue" title when issue is null', () => {
      render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      expect(screen.getByText('Create Issue')).toBeInTheDocument()
    })

    it('shows "Create" button when issue is null', () => {
      render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
    })

    it('starts with empty fields', () => {
      render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      expect(screen.getByPlaceholderText('Issue title')).toHaveValue('')
      expect(screen.getByPlaceholderText('Describe the issue...')).toHaveValue('')
      expect(screen.getByPlaceholderText('GitHub username')).toHaveValue('')
    })

    it('defaults to task type', () => {
      const { container } = render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      const typeSelect = getSelectByLabel(container, 'Type')
      expect(typeSelect.value).toBe('task')
    })

    it('defaults to open status', () => {
      const { container } = render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      const statusSelect = getSelectByLabel(container, 'Status')
      expect(statusSelect.value).toBe('open')
    })

    it('defaults to priority 3 (Medium)', () => {
      const { container } = render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      const prioritySelect = getSelectByLabel(container, 'Priority')
      expect(prioritySelect.value).toBe('3')
    })
  })

  describe('edit mode', () => {
    it('shows "Edit Issue" title when issue is provided', () => {
      const issue = createIssue({ title: 'Existing Issue' })

      render(<IssueForm issue={issue} onSave={mockOnSave} onCancel={mockOnCancel} />)

      expect(screen.getByText('Edit Issue')).toBeInTheDocument()
    })

    it('shows "Save" button when issue is provided', () => {
      const issue = createIssue({})

      render(<IssueForm issue={issue} onSave={mockOnSave} onCancel={mockOnCancel} />)

      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    })

    it('populates fields with issue data', () => {
      const issue = createIssue({
        title: 'Bug Fix',
        description: 'Fix the login bug',
        issue_type: 'bug',
        status: 'in_progress',
        priority: 1,
        assignee: 'alice',
      })

      const { container } = render(<IssueForm issue={issue} onSave={mockOnSave} onCancel={mockOnCancel} />)

      expect(screen.getByPlaceholderText('Issue title')).toHaveValue('Bug Fix')
      expect(screen.getByPlaceholderText('Describe the issue...')).toHaveValue('Fix the login bug')
      expect(getSelectByLabel(container, 'Type').value).toBe('bug')
      expect(getSelectByLabel(container, 'Status').value).toBe('in_progress')
      expect(getSelectByLabel(container, 'Priority').value).toBe('1')
      expect(screen.getByPlaceholderText('GitHub username')).toHaveValue('alice')
    })
  })

  describe('field updates', () => {
    it('updates title on input', () => {
      render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      const titleInput = screen.getByPlaceholderText('Issue title')
      fireEvent.change(titleInput, { target: { value: 'New Title' } })

      expect(titleInput).toHaveValue('New Title')
    })

    it('updates description on input', () => {
      render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      const descInput = screen.getByPlaceholderText('Describe the issue...')
      fireEvent.change(descInput, { target: { value: 'New description' } })

      expect(descInput).toHaveValue('New description')
    })

    it('updates type on select change', () => {
      const { container } = render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      const typeSelect = getSelectByLabel(container, 'Type')
      fireEvent.change(typeSelect, { target: { value: 'bug' } })

      expect(typeSelect).toHaveValue('bug')
    })

    it('updates status on select change', () => {
      const { container } = render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      const statusSelect = getSelectByLabel(container, 'Status')
      fireEvent.change(statusSelect, { target: { value: 'closed' } })

      expect(statusSelect).toHaveValue('closed')
    })

    it('updates priority on select change', () => {
      const { container } = render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      const prioritySelect = getSelectByLabel(container, 'Priority')
      fireEvent.change(prioritySelect, { target: { value: '1' } })

      expect(prioritySelect).toHaveValue('1')
    })

    it('updates assignee on input', () => {
      render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      const assigneeInput = screen.getByPlaceholderText('GitHub username')
      fireEvent.change(assigneeInput, { target: { value: 'bob' } })

      expect(assigneeInput).toHaveValue('bob')
    })
  })

  describe('form submission', () => {
    it('calls onSave with form data for new issue', () => {
      const { container } = render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      fireEvent.change(screen.getByPlaceholderText('Issue title'), { target: { value: 'New Bug' } })
      fireEvent.change(screen.getByPlaceholderText('Describe the issue...'), { target: { value: 'Description here' } })
      fireEvent.change(getSelectByLabel(container, 'Type'), { target: { value: 'bug' } })
      fireEvent.change(getSelectByLabel(container, 'Status'), { target: { value: 'open' } })
      fireEvent.change(getSelectByLabel(container, 'Priority'), { target: { value: '2' } })
      fireEvent.change(screen.getByPlaceholderText('GitHub username'), { target: { value: 'alice' } })

      fireEvent.click(screen.getByRole('button', { name: 'Create' }))

      expect(mockOnSave).toHaveBeenCalledWith({
        title: 'New Bug',
        description: 'Description here',
        issue_type: 'bug',
        status: 'open',
        priority: 2,
        assignee: 'alice',
        links: undefined,
      })
    })

    it('includes id and sha for existing issue', () => {
      const issue = createIssue({
        id: 'issue-456',
        sha: 'abc123',
        title: 'Existing',
      })

      render(<IssueForm issue={issue} onSave={mockOnSave} onCancel={mockOnCancel} />)

      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'issue-456',
          sha: 'abc123',
        })
      )
    })

    it('excludes empty assignee', () => {
      render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      fireEvent.change(screen.getByPlaceholderText('Issue title'), { target: { value: 'Title' } })
      // Leave assignee empty
      fireEvent.click(screen.getByRole('button', { name: 'Create' }))

      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({
          assignee: undefined,
        })
      )
    })

    it('prevents submission without title (required field)', () => {
      render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      // Title is empty, form should be invalid
      const titleInput = screen.getByPlaceholderText('Issue title') as HTMLInputElement
      expect(titleInput.required).toBe(true)
    })
  })

  describe('cancel button', () => {
    it('calls onCancel when clicked', () => {
      render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(mockOnCancel).toHaveBeenCalled()
    })

    it('does not call onSave when Cancel clicked', () => {
      render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(mockOnSave).not.toHaveBeenCalled()
    })
  })

  describe('type options', () => {
    it('has all issue type options', () => {
      const { container } = render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      const typeSelect = getSelectByLabel(container, 'Type')
      const options = Array.from(typeSelect.querySelectorAll('option')).map(o => o.value)

      expect(options).toContain('task')
      expect(options).toContain('bug')
      expect(options).toContain('feature')
      expect(options).toContain('epic')
    })
  })

  describe('status options', () => {
    it('has all status options', () => {
      const { container } = render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      const statusSelect = getSelectByLabel(container, 'Status')
      const options = Array.from(statusSelect.querySelectorAll('option')).map(o => o.value)

      expect(options).toContain('open')
      expect(options).toContain('in_progress')
      expect(options).toContain('closed')
    })
  })

  describe('priority options', () => {
    it('has all priority options', () => {
      const { container } = render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      const prioritySelect = getSelectByLabel(container, 'Priority')
      const options = Array.from(prioritySelect.querySelectorAll('option')).map(o => o.value)

      expect(options).toContain('1')
      expect(options).toContain('2')
      expect(options).toContain('3')
      expect(options).toContain('4')
      expect(options).toContain('5')
    })

    it('displays priority labels', () => {
      render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      expect(screen.getByText('1 - Critical')).toBeInTheDocument()
      expect(screen.getByText('2 - High')).toBeInTheDocument()
      expect(screen.getByText('3 - Medium')).toBeInTheDocument()
      expect(screen.getByText('4 - Low')).toBeInTheDocument()
      expect(screen.getByText('5 - Lowest')).toBeInTheDocument()
    })
  })

  describe('linked PRs & Commits section', () => {
    it('renders GitHubLinks component', () => {
      render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      expect(screen.getByText('Linked PRs & Commits')).toBeInTheDocument()
    })

    it('shows existing links when editing', () => {
      const issue = createIssue({
        links: [
          { type: 'pr', url: 'https://github.com/owner/repo/pull/1', number: 1, title: 'Fix bug' },
        ],
      })

      render(<IssueForm issue={issue} onSave={mockOnSave} onCancel={mockOnCancel} />)

      // GitHubLinks component should render the link title
      expect(screen.getByText('Fix bug')).toBeInTheDocument()
    })
  })

  describe('form labels', () => {
    it('has Title label', () => {
      render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      expect(screen.getByText('Title')).toBeInTheDocument()
    })

    it('has Description label', () => {
      render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      expect(screen.getByText('Description')).toBeInTheDocument()
    })

    it('has Type label', () => {
      render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      expect(screen.getByText('Type')).toBeInTheDocument()
    })

    it('has Status label', () => {
      render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      expect(screen.getByText('Status')).toBeInTheDocument()
    })

    it('has Priority label', () => {
      render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      expect(screen.getByText('Priority')).toBeInTheDocument()
    })

    it('has Assignee label', () => {
      render(<IssueForm issue={null} onSave={mockOnSave} onCancel={mockOnCancel} />)

      expect(screen.getByText('Assignee')).toBeInTheDocument()
    })
  })
})
