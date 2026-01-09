import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GitHubLinks, { parseGitHubUrl, extractGitHubLinks } from './GitHubLinks'

describe('parseGitHubUrl', () => {
  describe('PR URLs', () => {
    it('parses standard PR URL', () => {
      const result = parseGitHubUrl('https://github.com/owner/repo/pull/123')

      expect(result).toEqual({
        type: 'pr',
        url: 'https://github.com/owner/repo/pull/123',
        number: 123,
      })
    })

    it('parses PR URL without https', () => {
      const result = parseGitHubUrl('github.com/owner/repo/pull/456')

      expect(result).toEqual({
        type: 'pr',
        url: 'https://github.com/owner/repo/pull/456',
        number: 456,
      })
    })

    it('handles PR URL with trailing content', () => {
      const result = parseGitHubUrl('https://github.com/owner/repo/pull/789/files')

      expect(result?.type).toBe('pr')
      expect(result?.number).toBe(789)
    })
  })

  describe('commit URLs', () => {
    it('parses commit URL', () => {
      const result = parseGitHubUrl('https://github.com/owner/repo/commit/abc123def456')

      expect(result).toEqual({
        type: 'commit',
        url: 'https://github.com/owner/repo/commit/abc123def456',
        sha: 'abc123def456',
      })
    })

    it('handles full SHA', () => {
      const sha = 'a'.repeat(40)
      const result = parseGitHubUrl(`https://github.com/owner/repo/commit/${sha}`)

      expect(result?.type).toBe('commit')
      expect(result?.sha).toBe(sha)
    })
  })

  describe('issue URLs', () => {
    it('parses issue URL', () => {
      const result = parseGitHubUrl('https://github.com/owner/repo/issues/42')

      expect(result).toEqual({
        type: 'issue',
        url: 'https://github.com/owner/repo/issues/42',
        number: 42,
      })
    })
  })

  describe('invalid URLs', () => {
    it('returns null for non-GitHub URLs', () => {
      expect(parseGitHubUrl('https://gitlab.com/owner/repo/pull/1')).toBeNull()
    })

    it('returns null for GitHub repo URL without PR/commit/issue', () => {
      expect(parseGitHubUrl('https://github.com/owner/repo')).toBeNull()
    })

    it('returns null for invalid URL format', () => {
      expect(parseGitHubUrl('not a url at all')).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(parseGitHubUrl('')).toBeNull()
    })

    it('handles whitespace', () => {
      const result = parseGitHubUrl('  https://github.com/owner/repo/pull/1  ')
      expect(result?.type).toBe('pr')
    })
  })
})

describe('extractGitHubLinks', () => {
  it('extracts multiple links from text', () => {
    const text = `
      Check out https://github.com/owner/repo/pull/1 for the fix.
      Related to https://github.com/owner/repo/issues/42.
      Commit: https://github.com/owner/repo/commit/abc123
    `

    const links = extractGitHubLinks(text)

    expect(links).toHaveLength(3)
    expect(links.map(l => l.type)).toEqual(['pr', 'issue', 'commit'])
  })

  it('deduplicates identical URLs', () => {
    const text = `
      See https://github.com/owner/repo/pull/1
      Again: https://github.com/owner/repo/pull/1
    `

    const links = extractGitHubLinks(text)

    expect(links).toHaveLength(1)
  })

  it('returns empty array for text without GitHub links', () => {
    const text = 'No links here, just plain text.'

    const links = extractGitHubLinks(text)

    expect(links).toEqual([])
  })

  it('ignores non-PR/commit/issue GitHub URLs', () => {
    const text = 'Check https://github.com/owner/repo and https://github.com/owner/repo/pull/1'

    const links = extractGitHubLinks(text)

    expect(links).toHaveLength(1)
    expect(links[0].type).toBe('pr')
  })

  it('handles URLs in parentheses', () => {
    const text = 'See (https://github.com/owner/repo/pull/1) for details'

    const links = extractGitHubLinks(text)

    expect(links).toHaveLength(1)
  })
})

describe('GitHubLinks component', () => {
  const mockLinks = [
    { type: 'pr' as const, url: 'https://github.com/owner/repo/pull/1', number: 1 },
    { type: 'commit' as const, url: 'https://github.com/owner/repo/commit/abc123', sha: 'abc123' },
  ]

  describe('display mode', () => {
    it('renders links', () => {
      render(<GitHubLinks links={mockLinks} readOnly />)

      expect(screen.getByText('owner/repo#1')).toBeInTheDocument()
      expect(screen.getByText('owner/repo@abc123')).toBeInTheDocument()
    })

    it('shows link icons by type', () => {
      render(<GitHubLinks links={mockLinks} readOnly />)

      // PR icon
      expect(screen.getByTitle('PR')).toBeInTheDocument()
      // Commit icon
      expect(screen.getByTitle('COMMIT')).toBeInTheDocument()
    })

    it('renders links as anchor tags', () => {
      render(<GitHubLinks links={mockLinks} readOnly />)

      const anchors = screen.getAllByRole('link')
      expect(anchors).toHaveLength(2)
      expect(anchors[0]).toHaveAttribute('href', 'https://github.com/owner/repo/pull/1')
      expect(anchors[0]).toHaveAttribute('target', '_blank')
    })

    it('uses title if provided', () => {
      const linksWithTitle = [
        { type: 'pr' as const, url: 'https://github.com/owner/repo/pull/1', number: 1, title: 'Fix the bug' },
      ]

      render(<GitHubLinks links={linksWithTitle} readOnly />)

      expect(screen.getByText('Fix the bug')).toBeInTheDocument()
    })
  })

  describe('edit mode', () => {
    it('shows input and add button when not readOnly', () => {
      const onAdd = vi.fn()
      render(<GitHubLinks links={[]} onAdd={onAdd} />)

      expect(screen.getByPlaceholderText(/Paste GitHub/)).toBeInTheDocument()
      expect(screen.getByText('Add Link')).toBeInTheDocument()
    })

    it('calls onAdd with parsed link', () => {
      const onAdd = vi.fn()
      render(<GitHubLinks links={[]} onAdd={onAdd} />)

      const input = screen.getByPlaceholderText(/Paste GitHub/)
      fireEvent.change(input, { target: { value: 'https://github.com/owner/repo/pull/42' } })
      fireEvent.click(screen.getByText('Add Link'))

      expect(onAdd).toHaveBeenCalledWith({
        type: 'pr',
        url: 'https://github.com/owner/repo/pull/42',
        number: 42,
      })
    })

    it('shows error for invalid URL', () => {
      const onAdd = vi.fn()
      render(<GitHubLinks links={[]} onAdd={onAdd} />)

      const input = screen.getByPlaceholderText(/Paste GitHub/)
      fireEvent.change(input, { target: { value: 'not a valid url' } })
      fireEvent.click(screen.getByText('Add Link'))

      expect(screen.getByText(/Invalid GitHub URL/)).toBeInTheDocument()
      expect(onAdd).not.toHaveBeenCalled()
    })

    it('shows error for duplicate link', () => {
      const onAdd = vi.fn()
      const existingLinks = [
        { type: 'pr' as const, url: 'https://github.com/owner/repo/pull/1', number: 1 },
      ]
      render(<GitHubLinks links={existingLinks} onAdd={onAdd} />)

      const input = screen.getByPlaceholderText(/Paste GitHub/)
      fireEvent.change(input, { target: { value: 'https://github.com/owner/repo/pull/1' } })
      fireEvent.click(screen.getByText('Add Link'))

      expect(screen.getByText(/already added/)).toBeInTheDocument()
      expect(onAdd).not.toHaveBeenCalled()
    })

    it('clears input after successful add', () => {
      const onAdd = vi.fn()
      render(<GitHubLinks links={[]} onAdd={onAdd} />)

      const input = screen.getByPlaceholderText(/Paste GitHub/) as HTMLInputElement
      fireEvent.change(input, { target: { value: 'https://github.com/owner/repo/pull/1' } })
      fireEvent.click(screen.getByText('Add Link'))

      expect(input.value).toBe('')
    })

    it('supports Enter key to add', () => {
      const onAdd = vi.fn()
      render(<GitHubLinks links={[]} onAdd={onAdd} />)

      const input = screen.getByPlaceholderText(/Paste GitHub/)
      fireEvent.change(input, { target: { value: 'https://github.com/owner/repo/pull/1' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onAdd).toHaveBeenCalled()
    })

    it('disables add button when input is empty', () => {
      const onAdd = vi.fn()
      render(<GitHubLinks links={[]} onAdd={onAdd} />)

      const button = screen.getByText('Add Link')
      expect(button).toBeDisabled()
    })
  })

  describe('remove functionality', () => {
    it('shows remove button when onRemove provided', () => {
      const onRemove = vi.fn()
      render(<GitHubLinks links={mockLinks} onRemove={onRemove} />)

      const removeButtons = screen.getAllByTitle('Remove link')
      expect(removeButtons).toHaveLength(2)
    })

    it('calls onRemove with index', () => {
      const onRemove = vi.fn()
      render(<GitHubLinks links={mockLinks} onRemove={onRemove} />)

      const removeButtons = screen.getAllByTitle('Remove link')
      fireEvent.click(removeButtons[1])

      expect(onRemove).toHaveBeenCalledWith(1)
    })

    it('hides remove button in readOnly mode', () => {
      const onRemove = vi.fn()
      render(<GitHubLinks links={mockLinks} onRemove={onRemove} readOnly />)

      expect(screen.queryByTitle('Remove link')).not.toBeInTheDocument()
    })
  })
})
