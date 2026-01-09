import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import Dashboard from './Dashboard'

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
  }
}

// Helper to get stat value by label
function getStatValue(container: HTMLElement, label: string): string {
  const statDivs = container.querySelectorAll('.dashboard-stat')
  for (const div of statDivs) {
    const labelEl = div.querySelector('.dashboard-stat-label')
    if (labelEl?.textContent === label) {
      const valueEl = div.querySelector('.dashboard-stat-value')
      return valueEl?.textContent || ''
    }
  }
  return ''
}

describe('Dashboard', () => {
  describe('empty state', () => {
    it('renders with zero issues', () => {
      const { container } = render(<Dashboard issues={[]} />)

      expect(getStatValue(container, 'Total Issues')).toBe('0')
      expect(screen.getByText('Total Issues')).toBeInTheDocument()
    })

    it('shows 0% completion rate with no issues', () => {
      const { container } = render(<Dashboard issues={[]} />)

      expect(getStatValue(container, 'Completion Rate')).toBe('0%')
    })
  })

  describe('status counts', () => {
    it('counts open issues correctly', () => {
      const issues = [
        createIssue({ status: 'open' }),
        createIssue({ status: 'open' }),
        createIssue({ status: 'closed' }),
      ]

      const { container } = render(<Dashboard issues={issues} />)

      expect(getStatValue(container, 'Open')).toBe('2')
    })

    it('counts in_progress issues correctly', () => {
      const issues = [
        createIssue({ status: 'in_progress' }),
        createIssue({ status: 'in_progress' }),
        createIssue({ status: 'in_progress' }),
        createIssue({ status: 'open' }),
      ]

      const { container } = render(<Dashboard issues={issues} />)

      expect(getStatValue(container, 'In Progress')).toBe('3')
    })

    it('counts closed issues correctly', () => {
      const issues = [
        createIssue({ status: 'closed' }),
        createIssue({ status: 'open' }),
      ]

      const { container } = render(<Dashboard issues={issues} />)

      expect(getStatValue(container, 'Closed')).toBe('1')
    })

    it('shows correct total count', () => {
      const issues = [
        createIssue({}),
        createIssue({}),
        createIssue({}),
        createIssue({}),
        createIssue({}),
      ]

      const { container } = render(<Dashboard issues={issues} />)

      expect(getStatValue(container, 'Total Issues')).toBe('5')
    })
  })

  describe('completion rate calculation', () => {
    it('calculates 50% when half are closed', () => {
      const issues = [
        createIssue({ status: 'closed' }),
        createIssue({ status: 'open' }),
      ]

      const { container } = render(<Dashboard issues={issues} />)

      expect(getStatValue(container, 'Completion Rate')).toBe('50%')
    })

    it('calculates 100% when all are closed', () => {
      const issues = [
        createIssue({ status: 'closed' }),
        createIssue({ status: 'closed' }),
        createIssue({ status: 'closed' }),
      ]

      const { container } = render(<Dashboard issues={issues} />)

      expect(getStatValue(container, 'Completion Rate')).toBe('100%')
    })

    it('calculates 0% when none are closed', () => {
      const issues = [
        createIssue({ status: 'open' }),
        createIssue({ status: 'in_progress' }),
      ]

      const { container } = render(<Dashboard issues={issues} />)

      expect(getStatValue(container, 'Completion Rate')).toBe('0%')
    })

    it('rounds to nearest integer', () => {
      // 1 closed out of 3 = 33.33...%
      const issues = [
        createIssue({ status: 'closed' }),
        createIssue({ status: 'open' }),
        createIssue({ status: 'open' }),
      ]

      const { container } = render(<Dashboard issues={issues} />)

      expect(getStatValue(container, 'Completion Rate')).toBe('33%')
    })
  })

  describe('type counts', () => {
    it('counts bugs correctly', () => {
      const issues = [
        createIssue({ issue_type: 'bug' }),
        createIssue({ issue_type: 'bug' }),
        createIssue({ issue_type: 'task' }),
      ]

      render(<Dashboard issues={issues} />)

      expect(screen.getByText('Bugs')).toBeInTheDocument()
      // The bar chart shows the count as text
      const rows = screen.getAllByText('2')
      expect(rows.length).toBeGreaterThan(0)
    })

    it('counts features correctly', () => {
      const issues = [
        createIssue({ issue_type: 'feature' }),
        createIssue({ issue_type: 'feature' }),
        createIssue({ issue_type: 'feature' }),
        createIssue({ issue_type: 'bug' }),
      ]

      render(<Dashboard issues={issues} />)

      expect(screen.getByText('Features')).toBeInTheDocument()
    })

    it('counts tasks correctly', () => {
      const issues = [
        createIssue({ issue_type: 'task' }),
      ]

      render(<Dashboard issues={issues} />)

      expect(screen.getByText('Tasks')).toBeInTheDocument()
    })

    it('counts epics correctly', () => {
      const issues = [
        createIssue({ issue_type: 'epic' }),
        createIssue({ issue_type: 'epic' }),
      ]

      render(<Dashboard issues={issues} />)

      expect(screen.getByText('Epics')).toBeInTheDocument()
    })
  })

  describe('priority counts', () => {
    it('counts critical priority issues', () => {
      const issues = [
        createIssue({ priority: 1 }),
        createIssue({ priority: 1 }),
      ]

      render(<Dashboard issues={issues} />)

      expect(screen.getByText('Critical')).toBeInTheDocument()
    })

    it('counts high priority issues', () => {
      const issues = [
        createIssue({ priority: 2 }),
      ]

      render(<Dashboard issues={issues} />)

      expect(screen.getByText('High')).toBeInTheDocument()
    })

    it('counts medium priority issues', () => {
      const issues = [
        createIssue({ priority: 3 }),
        createIssue({ priority: 3 }),
        createIssue({ priority: 3 }),
      ]

      render(<Dashboard issues={issues} />)

      expect(screen.getByText('Medium')).toBeInTheDocument()
    })

    it('counts low priority issues', () => {
      const issues = [
        createIssue({ priority: 4 }),
      ]

      render(<Dashboard issues={issues} />)

      expect(screen.getByText('Low')).toBeInTheDocument()
    })

    it('counts lowest priority issues', () => {
      const issues = [
        createIssue({ priority: 5 }),
      ]

      render(<Dashboard issues={issues} />)

      expect(screen.getByText('Lowest')).toBeInTheDocument()
    })
  })

  describe('recent activity (7 days)', () => {
    it('counts issues updated within last 7 days', () => {
      const now = new Date()
      const threeDaysAgo = new Date(now)
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

      const issues = [
        createIssue({ updated_at: threeDaysAgo.toISOString() }),
        createIssue({ updated_at: threeDaysAgo.toISOString() }),
        createIssue({ created_at: '2020-01-01T00:00:00Z' }), // old issue
      ]

      render(<Dashboard issues={issues} />)

      const activeLabel = screen.getByText('Active (7 days)')
      const activeValue = activeLabel.previousElementSibling
      expect(activeValue).toHaveTextContent('2')
    })

    it('uses created_at if updated_at is missing', () => {
      const now = new Date()
      const oneDayAgo = new Date(now)
      oneDayAgo.setDate(oneDayAgo.getDate() - 1)

      const issues = [
        createIssue({ created_at: oneDayAgo.toISOString() }),
      ]

      render(<Dashboard issues={issues} />)

      const activeLabel = screen.getByText('Active (7 days)')
      const activeValue = activeLabel.previousElementSibling
      expect(activeValue).toHaveTextContent('1')
    })

    it('excludes issues older than 7 days', () => {
      const tenDaysAgo = new Date()
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)

      const issues = [
        createIssue({ updated_at: tenDaysAgo.toISOString() }),
      ]

      render(<Dashboard issues={issues} />)

      const activeLabel = screen.getByText('Active (7 days)')
      const activeValue = activeLabel.previousElementSibling
      expect(activeValue).toHaveTextContent('0')
    })
  })

  describe('status breakdown bar', () => {
    it('shows status breakdown percentages', () => {
      const issues = [
        createIssue({ status: 'open' }),
        createIssue({ status: 'open' }),
        createIssue({ status: 'in_progress' }),
        createIssue({ status: 'closed' }),
      ]

      render(<Dashboard issues={issues} />)

      // 2 open out of 4 = 50%, 1 in_progress = 25%, 1 closed = 25%
      expect(screen.getByTitle('Open: 2')).toBeInTheDocument()
      expect(screen.getByTitle('In Progress: 1')).toBeInTheDocument()
      expect(screen.getByTitle('Closed: 1')).toBeInTheDocument()
    })

    it('does not show segment for zero count', () => {
      const issues = [
        createIssue({ status: 'open' }),
        createIssue({ status: 'open' }),
      ]

      render(<Dashboard issues={issues} />)

      // Should have Open segment but not Closed or In Progress
      expect(screen.getByTitle('Open: 2')).toBeInTheDocument()
      expect(screen.queryByTitle(/In Progress:/)).not.toBeInTheDocument()
      expect(screen.queryByTitle(/Closed:/)).not.toBeInTheDocument()
    })
  })

  describe('chart rendering', () => {
    it('renders Issues by Type chart', () => {
      render(<Dashboard issues={[createIssue({})]} />)

      expect(screen.getByText('Issues by Type')).toBeInTheDocument()
    })

    it('renders Issues by Priority chart', () => {
      render(<Dashboard issues={[createIssue({})]} />)

      expect(screen.getByText('Issues by Priority')).toBeInTheDocument()
    })

    it('renders Status Breakdown chart', () => {
      render(<Dashboard issues={[createIssue({})]} />)

      expect(screen.getByText('Status Breakdown')).toBeInTheDocument()
    })
  })
})
