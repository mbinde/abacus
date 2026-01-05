import { useState } from 'react'

interface GitHubLink {
  type: 'pr' | 'commit' | 'issue'
  url: string
  number?: number
  sha?: string
  title?: string
}

interface Props {
  links: GitHubLink[]
  onAdd?: (link: GitHubLink) => void
  onRemove?: (index: number) => void
  readOnly?: boolean
}

export default function GitHubLinks({ links, onAdd, onRemove, readOnly = false }: Props) {
  const [inputUrl, setInputUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleAdd = () => {
    if (!inputUrl.trim()) return
    setError(null)

    const link = parseGitHubUrl(inputUrl.trim())
    if (!link) {
      setError('Invalid GitHub URL. Must be a PR, commit, or issue URL.')
      return
    }

    // Check for duplicates
    if (links.some(l => l.url === link.url)) {
      setError('This link is already added.')
      return
    }

    onAdd?.(link)
    setInputUrl('')
  }

  return (
    <div>
      {links.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          {links.map((link, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem',
                marginBottom: '0.25rem',
                background: '#1a1a24',
                borderRadius: '4px',
                border: '1px solid #2a2a3a',
              }}
            >
              <LinkIcon type={link.type} />
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1,
                  color: '#4dc3ff',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {formatLinkText(link)}
              </a>
              {!readOnly && onRemove && (
                <button
                  onClick={() => onRemove(index)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#888',
                    cursor: 'pointer',
                    padding: '0.25rem',
                    fontSize: '1rem',
                    lineHeight: 1,
                  }}
                  title="Remove link"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!readOnly && onAdd && (
        <div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => {
                setInputUrl(e.target.value)
                setError(null)
              }}
              placeholder="Paste GitHub PR, commit, or issue URL..."
              style={{
                flex: 1,
                padding: '0.5rem',
                fontSize: '0.875rem',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAdd()
                }
              }}
            />
            <button
              onClick={handleAdd}
              disabled={!inputUrl.trim()}
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
            >
              Add Link
            </button>
          </div>
          {error && (
            <div style={{ color: '#ff6b6b', fontSize: '0.75rem', marginTop: '0.25rem' }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LinkIcon({ type }: { type: GitHubLink['type'] }) {
  const icons: Record<GitHubLink['type'], { icon: string; color: string }> = {
    pr: { icon: '↳', color: '#4ade80' },
    commit: { icon: '●', color: '#ffb464' },
    issue: { icon: '#', color: '#64b4ff' },
  }

  const { icon, color } = icons[type]

  return (
    <span
      style={{
        color,
        fontWeight: 600,
        fontSize: '0.875rem',
        width: 20,
        textAlign: 'center',
      }}
      title={type.toUpperCase()}
    >
      {icon}
    </span>
  )
}

function formatLinkText(link: GitHubLink): string {
  if (link.title) return link.title

  // Extract repo info from URL
  const match = link.url.match(/github\.com\/([^/]+)\/([^/]+)/)
  const repo = match ? `${match[1]}/${match[2]}` : ''

  switch (link.type) {
    case 'pr':
      return link.number ? `${repo}#${link.number}` : link.url
    case 'commit':
      return link.sha ? `${repo}@${link.sha.slice(0, 7)}` : link.url
    case 'issue':
      return link.number ? `${repo}#${link.number}` : link.url
    default:
      return link.url
  }
}

export function parseGitHubUrl(url: string): GitHubLink | null {
  // Normalize URL
  let normalized = url.trim()
  if (!normalized.startsWith('http')) {
    normalized = `https://${normalized}`
  }

  try {
    const parsed = new URL(normalized)
    if (parsed.hostname !== 'github.com') return null

    const pathParts = parsed.pathname.split('/').filter(Boolean)

    // PR: github.com/owner/repo/pull/123
    if (pathParts.length >= 4 && pathParts[2] === 'pull') {
      return {
        type: 'pr',
        url: normalized,
        number: parseInt(pathParts[3], 10),
      }
    }

    // Commit: github.com/owner/repo/commit/abc123
    if (pathParts.length >= 4 && pathParts[2] === 'commit') {
      return {
        type: 'commit',
        url: normalized,
        sha: pathParts[3],
      }
    }

    // Issue: github.com/owner/repo/issues/123
    if (pathParts.length >= 4 && pathParts[2] === 'issues') {
      return {
        type: 'issue',
        url: normalized,
        number: parseInt(pathParts[3], 10),
      }
    }

    return null
  } catch {
    return null
  }
}

// Extract GitHub links from text
export function extractGitHubLinks(text: string): GitHubLink[] {
  const links: GitHubLink[] = []
  const urlRegex = /https?:\/\/github\.com\/[^\s)]+/g
  const matches = text.match(urlRegex) || []

  for (const match of matches) {
    const link = parseGitHubUrl(match)
    if (link && !links.some(l => l.url === link.url)) {
      links.push(link)
    }
  }

  return links
}
