import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EmptyState from './EmptyState'

describe('EmptyState', () => {
  describe('issues type', () => {
    it('renders issues empty state', () => {
      render(<EmptyState type="issues" />)

      expect(screen.getByText('📋')).toBeInTheDocument()
      expect(screen.getByText('No issues yet')).toBeInTheDocument()
      expect(screen.getByText(/Get started by creating/)).toBeInTheDocument()
    })

    it('shows action button when onAction provided', () => {
      const onAction = vi.fn()
      render(<EmptyState type="issues" onAction={onAction} />)

      const button = screen.getByText('Create Issue')
      expect(button).toBeInTheDocument()

      fireEvent.click(button)
      expect(onAction).toHaveBeenCalledTimes(1)
    })

    it('hides action button when onAction not provided', () => {
      render(<EmptyState type="issues" />)

      expect(screen.queryByText('Create Issue')).not.toBeInTheDocument()
    })
  })

  describe('repos type', () => {
    it('renders repos empty state', () => {
      render(<EmptyState type="repos" />)

      expect(screen.getByText('📁')).toBeInTheDocument()
      expect(screen.getByText('No repositories added')).toBeInTheDocument()
      expect(screen.getByText(/Add a GitHub repository/)).toBeInTheDocument()
    })

    it('shows Add Repository button', () => {
      const onAction = vi.fn()
      render(<EmptyState type="repos" onAction={onAction} />)

      expect(screen.getByText('Add Repository')).toBeInTheDocument()
    })
  })

  describe('search type', () => {
    it('renders search empty state without action button', () => {
      const onAction = vi.fn()
      render(<EmptyState type="search" onAction={onAction} />)

      expect(screen.getByText('🔍')).toBeInTheDocument()
      expect(screen.getByText('No results found')).toBeInTheDocument()
      expect(screen.getByText(/Try adjusting your search/)).toBeInTheDocument()

      // No action button for search type
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  describe('starred type', () => {
    it('renders starred empty state without action button', () => {
      const onAction = vi.fn()
      render(<EmptyState type="starred" onAction={onAction} />)

      expect(screen.getByText('⭐')).toBeInTheDocument()
      expect(screen.getByText('No starred issues')).toBeInTheDocument()
      expect(screen.getByText(/Star important issues/)).toBeInTheDocument()

      // No action button for starred type
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })
})
