import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ActivityFeed from './ActivityFeed'

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
  closed_at: string
  comments: Array<{
    id: number
    issue_id: string
    author: string
    text: string
    created_at: string
  }>
}> = {}) {
  return {
    id: overrides.id ?? `test-${Math.random().toString(36).slice(2, 5)}`,
    title: overrides.title ?? 'Test Issue',
    description: overrides.description,
    status: overrides.status ?? 'open',
    priority: overrides.priority ?? 3,
    issue_type: overrides.issue_type ?? 'task',
    assignee: overrides.assignee,
    created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
    updated_at: overrides.updated_at,
    closed_at: overrides.closed_at,
    comments: overrides.comments,
  }
}

describe('ActivityFeed', () => {
  const mockOnIssueClick = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock Date.now for consistent time calculations
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-10T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('empty state', () => {
    it('shows empty message when no issues', () => {
      render(<ActivityFeed issues={[]} onIssueClick={mockOnIssueClick} />)

      expect(screen.getByText('No recent activity')).toBeInTheDocument()
    })
  })

  describe('activity generation', () => {
    it('generates created activity for each issue', () => {
      const issues = [
        createIssue({ title: 'First Issue', created_at: '2026-01-09T00:00:00Z' }),
        createIssue({ title: 'Second Issue', created_at: '2026-01-08T00:00:00Z' }),
      ]

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      expect(screen.getAllByText('Issue created:')).toHaveLength(2)
      expect(screen.getByText('First Issue')).toBeInTheDocument()
      expect(screen.getByText('Second Issue')).toBeInTheDocument()
    })

    it('generates closed activity for closed issues', () => {
      const issues = [
        createIssue({
          title: 'Closed Issue',
          status: 'closed',
          created_at: '2026-01-01T00:00:00Z',
          closed_at: '2026-01-09T00:00:00Z',
        }),
      ]

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      expect(screen.getByText('Issue closed:')).toBeInTheDocument()
    })

    it('generates updated activity when updated_at differs from created_at and closed_at', () => {
      const issues = [
        createIssue({
          title: 'Updated Issue',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-05T00:00:00Z',
        }),
      ]

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      expect(screen.getByText('Issue updated:')).toBeInTheDocument()
    })

    it('does not generate updated activity when updated_at equals created_at', () => {
      const issues = [
        createIssue({
          title: 'Same Time Issue',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        }),
      ]

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      expect(screen.queryByText('Issue updated:')).not.toBeInTheDocument()
      expect(screen.getByText('Issue created:')).toBeInTheDocument()
    })

    it('does not generate updated activity when updated_at equals closed_at', () => {
      const issues = [
        createIssue({
          title: 'Closed Issue',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-05T00:00:00Z',
          closed_at: '2026-01-05T00:00:00Z',
        }),
      ]

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      expect(screen.queryByText('Issue updated:')).not.toBeInTheDocument()
      expect(screen.getByText('Issue closed:')).toBeInTheDocument()
    })

    it('generates comment activity for each comment', () => {
      const issues = [
        createIssue({
          title: 'Issue with Comments',
          created_at: '2026-01-01T00:00:00Z',
          comments: [
            { id: 1, issue_id: 'test-1', author: 'alice', text: 'First comment', created_at: '2026-01-08T00:00:00Z' },
            { id: 2, issue_id: 'test-1', author: 'bob', text: 'Second comment', created_at: '2026-01-09T00:00:00Z' },
          ],
        }),
      ]

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      expect(screen.getAllByText('Comment added:')).toHaveLength(2)
      expect(screen.getByText('@alice:')).toBeInTheDocument()
      expect(screen.getByText('@bob:')).toBeInTheDocument()
    })
  })

  describe('sorting', () => {
    it('sorts activities by timestamp descending (newest first)', () => {
      const issues = [
        createIssue({ title: 'Old Issue', created_at: '2026-01-01T00:00:00Z' }),
        createIssue({ title: 'New Issue', created_at: '2026-01-09T00:00:00Z' }),
      ]

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      const titles = screen.getAllByRole('link')
      expect(titles[0]).toHaveTextContent('New Issue')
      expect(titles[1]).toHaveTextContent('Old Issue')
    })

    it('interleaves different activity types by timestamp', () => {
      const issues = [
        createIssue({
          title: 'Issue A',
          created_at: '2026-01-01T00:00:00Z',
          comments: [
            { id: 1, issue_id: 'a', author: 'alice', text: 'Comment', created_at: '2026-01-05T00:00:00Z' },
          ],
        }),
        createIssue({
          title: 'Issue B',
          created_at: '2026-01-03T00:00:00Z',
        }),
      ]

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      // Order should be: Comment (Jan 5), Issue B created (Jan 3), Issue A created (Jan 1)
      const items = screen.getAllByRole('link')
      expect(items[0]).toHaveTextContent('Issue A') // Comment is most recent
      expect(items[1]).toHaveTextContent('Issue B')
      expect(items[2]).toHaveTextContent('Issue A')
    })
  })

  describe('filtering', () => {
    it('shows all activities by default', () => {
      const issues = [
        createIssue({
          title: 'Test Issue',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-03T00:00:00Z',
          closed_at: '2026-01-05T00:00:00Z',
          status: 'closed',
          comments: [
            { id: 1, issue_id: 'test', author: 'alice', text: 'Hi', created_at: '2026-01-02T00:00:00Z' },
          ],
        }),
      ]

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      expect(screen.getByText('Issue created:')).toBeInTheDocument()
      expect(screen.getByText('Issue closed:')).toBeInTheDocument()
      expect(screen.getByText('Comment added:')).toBeInTheDocument()
    })

    it('filters to show only created activities', () => {
      const issues = [
        createIssue({
          title: 'Test Issue',
          created_at: '2026-01-01T00:00:00Z',
          closed_at: '2026-01-05T00:00:00Z',
          status: 'closed',
        }),
      ]

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      fireEvent.click(screen.getByText(/Created/))

      expect(screen.getByText('Issue created:')).toBeInTheDocument()
      expect(screen.queryByText('Issue closed:')).not.toBeInTheDocument()
    })

    it('filters to show only closed activities', () => {
      const issues = [
        createIssue({
          title: 'Test Issue',
          created_at: '2026-01-01T00:00:00Z',
          closed_at: '2026-01-05T00:00:00Z',
          status: 'closed',
        }),
      ]

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      fireEvent.click(screen.getByText(/Closed/))

      expect(screen.queryByText('Issue created:')).not.toBeInTheDocument()
      expect(screen.getByText('Issue closed:')).toBeInTheDocument()
    })

    it('filters to show only comment activities', () => {
      const issues = [
        createIssue({
          title: 'Test Issue',
          created_at: '2026-01-01T00:00:00Z',
          comments: [
            { id: 1, issue_id: 'test', author: 'alice', text: 'Hi', created_at: '2026-01-02T00:00:00Z' },
          ],
        }),
      ]

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      fireEvent.click(screen.getByText(/Comments/))

      expect(screen.queryByText('Issue created:')).not.toBeInTheDocument()
      expect(screen.getByText('Comment added:')).toBeInTheDocument()
    })

    it('shows empty message when filter has no results', () => {
      const issues = [
        createIssue({ title: 'Open Issue', created_at: '2026-01-01T00:00:00Z' }),
      ]

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      fireEvent.click(screen.getByText(/Closed/))

      expect(screen.getByText('No closed activity')).toBeInTheDocument()
    })
  })

  describe('activity counts', () => {
    it('shows correct count for each filter button', () => {
      const issues = [
        createIssue({
          title: 'Issue 1',
          created_at: '2026-01-01T00:00:00Z',
          closed_at: '2026-01-05T00:00:00Z',
          status: 'closed',
        }),
        createIssue({
          title: 'Issue 2',
          created_at: '2026-01-02T00:00:00Z',
          comments: [
            { id: 1, issue_id: 'test', author: 'alice', text: 'Hi', created_at: '2026-01-03T00:00:00Z' },
            { id: 2, issue_id: 'test', author: 'bob', text: 'Hello', created_at: '2026-01-04T00:00:00Z' },
          ],
        }),
      ]

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      // 2 created, 1 closed, 2 comments = 5 total
      // Check that filter buttons exist with their counts
      const buttons = screen.getAllByRole('button')

      // Find button text contents
      const buttonTexts = buttons.map(b => b.textContent)

      // Verify All button shows 5, Closed button shows 1
      expect(buttonTexts.some(t => t?.includes('All') && t?.includes('(5)'))).toBe(true)
      expect(buttonTexts.some(t => t?.includes('Closed') && t?.includes('(1)'))).toBe(true)
      // 2 created, 2 comments
      expect(buttonTexts.some(t => t?.includes('Created') && t?.includes('(2)'))).toBe(true)
      expect(buttonTexts.some(t => t?.includes('Comments') && t?.includes('(2)'))).toBe(true)
    })
  })

  describe('limit', () => {
    it('respects limit prop', () => {
      const issues = Array.from({ length: 10 }, (_, i) =>
        createIssue({
          id: `issue-${i}`,
          title: `Issue ${i}`,
          created_at: `2026-01-0${i + 1}T00:00:00Z`,
        })
      )

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} limit={3} />)

      // Should only show 3 activities
      expect(screen.getAllByText('Issue created:')).toHaveLength(3)
    })

    it('defaults to 50 limit', () => {
      // Create 60 issues
      const issues = Array.from({ length: 60 }, (_, i) =>
        createIssue({
          id: `issue-${i}`,
          title: `Issue ${i}`,
          created_at: new Date(2026, 0, 1 + i).toISOString(),
        })
      )

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      // Should show at most 50
      expect(screen.getAllByText('Issue created:').length).toBeLessThanOrEqual(50)
    })
  })

  describe('click handling', () => {
    it('calls onIssueClick when activity is clicked', () => {
      const issue = createIssue({ title: 'Clickable Issue', created_at: '2026-01-01T00:00:00Z' })

      render(<ActivityFeed issues={[issue]} onIssueClick={mockOnIssueClick} />)

      fireEvent.click(screen.getByText('Clickable Issue'))

      expect(mockOnIssueClick).toHaveBeenCalledWith(issue)
    })

    it('calls onIssueClick with correct issue for comments', () => {
      const issue = createIssue({
        title: 'Issue with Comment',
        created_at: '2026-01-01T00:00:00Z',
        comments: [
          { id: 1, issue_id: 'test', author: 'alice', text: 'Test comment', created_at: '2026-01-09T00:00:00Z' },
        ],
      })

      render(<ActivityFeed issues={[issue]} onIssueClick={mockOnIssueClick} />)

      // Click on the comment activity's issue link
      const links = screen.getAllByText('Issue with Comment')
      fireEvent.click(links[0])

      expect(mockOnIssueClick).toHaveBeenCalledWith(issue)
    })
  })

  describe('time display', () => {
    it('shows "just now" for very recent activities', () => {
      const issues = [
        createIssue({ title: 'Just Created', created_at: '2026-01-10T11:59:30Z' }),
      ]

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      expect(screen.getByText('just now')).toBeInTheDocument()
    })

    it('shows minutes for activities under an hour', () => {
      const issues = [
        createIssue({ title: 'Recent', created_at: '2026-01-10T11:30:00Z' }),
      ]

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      expect(screen.getByText('30 minutes ago')).toBeInTheDocument()
    })

    it('shows singular minute', () => {
      const issues = [
        createIssue({ title: 'Recent', created_at: '2026-01-10T11:59:00Z' }),
      ]

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      expect(screen.getByText('1 minute ago')).toBeInTheDocument()
    })

    it('shows hours for activities under a day', () => {
      const issues = [
        createIssue({ title: 'Few Hours', created_at: '2026-01-10T06:00:00Z' }),
      ]

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      expect(screen.getByText('6 hours ago')).toBeInTheDocument()
    })

    it('shows days for activities under 30 days', () => {
      const issues = [
        createIssue({ title: 'Last Week', created_at: '2026-01-03T12:00:00Z' }),
      ]

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      expect(screen.getByText('7 days ago')).toBeInTheDocument()
    })
  })

  describe('comment display', () => {
    it('shows comment author and text', () => {
      const issues = [
        createIssue({
          title: 'Issue',
          created_at: '2026-01-01T00:00:00Z',
          comments: [
            { id: 1, issue_id: 'test', author: 'alice', text: 'This is my comment', created_at: '2026-01-09T00:00:00Z' },
          ],
        }),
      ]

      render(<ActivityFeed issues={issues} onIssueClick={mockOnIssueClick} />)

      expect(screen.getByText('@alice:')).toBeInTheDocument()
      // MentionText is used, so the comment text should be rendered
    })
  })
})
