import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MentionText, { extractMentions } from './MentionText'

describe('MentionText', () => {
  describe('rendering', () => {
    it('renders plain text without mentions', () => {
      render(<MentionText text="Hello world" />)

      expect(screen.getByText('Hello world')).toBeInTheDocument()
    })

    it('renders a single mention', () => {
      render(<MentionText text="Hello @alice" />)

      expect(screen.getByText('@alice')).toBeInTheDocument()
      expect(screen.getByText('Hello')).toBeInTheDocument()
    })

    it('renders multiple mentions', () => {
      render(<MentionText text="@alice and @bob are here" />)

      expect(screen.getByText('@alice')).toBeInTheDocument()
      expect(screen.getByText('@bob')).toBeInTheDocument()
    })

    it('renders mention at start of text', () => {
      render(<MentionText text="@alice said hello" />)

      expect(screen.getByText('@alice')).toBeInTheDocument()
      expect(screen.getByText('said hello')).toBeInTheDocument()
    })

    it('renders mention at end of text', () => {
      render(<MentionText text="Thanks @alice" />)

      expect(screen.getByText('Thanks')).toBeInTheDocument()
      expect(screen.getByText('@alice')).toBeInTheDocument()
    })

    it('renders consecutive mentions', () => {
      render(<MentionText text="@alice @bob @charlie" />)

      expect(screen.getByText('@alice')).toBeInTheDocument()
      expect(screen.getByText('@bob')).toBeInTheDocument()
      expect(screen.getByText('@charlie')).toBeInTheDocument()
    })

    it('renders empty string without error', () => {
      render(<MentionText text="" />)
      // Should render without crashing
    })
  })

  describe('mention styling', () => {
    it('styles mentions with special color', () => {
      render(<MentionText text="Hello @alice" />)

      const mention = screen.getByText('@alice')
      expect(mention).toHaveStyle({ color: '#4dc3ff' })
    })

    it('makes mentions bold', () => {
      render(<MentionText text="Hello @alice" />)

      const mention = screen.getByText('@alice')
      expect(mention).toHaveStyle({ fontWeight: '600' })
    })

    it('shows pointer cursor when onClick is provided', () => {
      const onClick = vi.fn()
      render(<MentionText text="Hello @alice" onMentionClick={onClick} />)

      const mention = screen.getByText('@alice')
      expect(mention).toHaveStyle({ cursor: 'pointer' })
    })

    it('shows default cursor when no onClick provided', () => {
      render(<MentionText text="Hello @alice" />)

      const mention = screen.getByText('@alice')
      expect(mention).toHaveStyle({ cursor: 'default' })
    })

    it('has title attribute with username', () => {
      render(<MentionText text="Hello @alice" />)

      const mention = screen.getByText('@alice')
      expect(mention).toHaveAttribute('title', '@alice')
    })
  })

  describe('click handling', () => {
    it('calls onMentionClick with username when mention clicked', () => {
      const onClick = vi.fn()
      render(<MentionText text="Hello @alice" onMentionClick={onClick} />)

      fireEvent.click(screen.getByText('@alice'))

      expect(onClick).toHaveBeenCalledWith('alice')
    })

    it('calls onMentionClick with correct username for multiple mentions', () => {
      const onClick = vi.fn()
      render(<MentionText text="@alice and @bob" onMentionClick={onClick} />)

      fireEvent.click(screen.getByText('@bob'))

      expect(onClick).toHaveBeenCalledWith('bob')
    })

    it('does not crash when clicked without onMentionClick', () => {
      render(<MentionText text="Hello @alice" />)

      // Should not throw
      fireEvent.click(screen.getByText('@alice'))
    })
  })

  describe('username pattern matching', () => {
    it('matches alphanumeric usernames', () => {
      render(<MentionText text="@user123" />)

      expect(screen.getByText('@user123')).toBeInTheDocument()
    })

    it('matches usernames with hyphens', () => {
      render(<MentionText text="@my-username" />)

      expect(screen.getByText('@my-username')).toBeInTheDocument()
    })

    it('matches usernames with underscores', () => {
      render(<MentionText text="@my_username" />)

      expect(screen.getByText('@my_username')).toBeInTheDocument()
    })

    it('matches usernames starting with number (GitHub allows)', () => {
      render(<MentionText text="@123abc" />)

      expect(screen.getByText('@123abc')).toBeInTheDocument()
    })

    it('does not match email addresses as mentions', () => {
      render(<MentionText text="email@example.com" />)

      // The @example part should be matched as a mention
      // but email should be separate text
      expect(screen.getByText('email')).toBeInTheDocument()
      expect(screen.getByText('@example')).toBeInTheDocument()
    })

    it('stops at punctuation', () => {
      render(<MentionText text="Hey @alice!" />)

      const mention = screen.getByText('@alice')
      expect(mention).toBeInTheDocument()
      // The ! should be separate
    })

    it('stops at spaces', () => {
      render(<MentionText text="@alice is here" />)

      const mention = screen.getByText('@alice')
      expect(mention).toBeInTheDocument()
      expect(screen.getByText('is here')).toBeInTheDocument()
    })
  })
})

describe('extractMentions', () => {
  it('extracts single mention', () => {
    const mentions = extractMentions('Hello @alice')

    expect(mentions).toEqual(['alice'])
  })

  it('extracts multiple mentions', () => {
    const mentions = extractMentions('@alice and @bob and @charlie')

    expect(mentions).toEqual(['alice', 'bob', 'charlie'])
  })

  it('returns empty array for no mentions', () => {
    const mentions = extractMentions('No mentions here')

    expect(mentions).toEqual([])
  })

  it('deduplicates repeated mentions', () => {
    const mentions = extractMentions('@alice @bob @alice')

    expect(mentions).toEqual(['alice', 'bob'])
  })

  it('handles empty string', () => {
    const mentions = extractMentions('')

    expect(mentions).toEqual([])
  })

  it('extracts usernames with special characters', () => {
    const mentions = extractMentions('@user-name_123')

    expect(mentions).toEqual(['user-name_123'])
  })

  it('preserves order of first appearance', () => {
    const mentions = extractMentions('@bob @alice @charlie @bob')

    expect(mentions).toEqual(['bob', 'alice', 'charlie'])
  })
})
