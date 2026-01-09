import { useState } from 'react'

interface Props {
  author: string
  text: string
  createdAt: string
}

// Parse backup comment to extract metadata
function parseBackupComment(text: string): { field: string; savedBy: string; timestamp: string; content: string } | null {
  // Format: ── backup: my edit to {field} ─────────────────────
  //         Saved by {user} in case of conflict
  //         {timestamp}
  //
  //         {content}
  //         ───────────────────────────────────────────────────
  const lines = text.split('\n')
  if (lines.length < 4) return null

  // Parse first line: ── backup: my edit to description ─────
  const headerMatch = lines[0].match(/── backup: my edit to (\w+)/)
  if (!headerMatch) return null
  const field = headerMatch[1]

  // Parse second line: Saved by {user} in case of conflict
  const savedByMatch = lines[1].match(/Saved by (.+?) in case of conflict/)
  if (!savedByMatch) return null
  const savedBy = savedByMatch[1]

  // Third line is timestamp
  const timestamp = lines[2]

  // Content is everything between line 4 and the closing delimiter
  const contentStart = 4 // After header, saved by, timestamp, and empty line
  const contentEnd = lines.findIndex((l, i) => i >= contentStart && l.startsWith('───'))
  const content = contentEnd > contentStart
    ? lines.slice(contentStart, contentEnd).join('\n')
    : lines.slice(contentStart).join('\n')

  return { field, savedBy, timestamp, content }
}

export default function BackupComment({ author, text, createdAt }: Props) {
  const [expanded, setExpanded] = useState(false)

  const parsed = parseBackupComment(text)

  // If we can't parse it, render as normal comment
  if (!parsed) {
    return (
      <div style={{
        padding: '0.5rem 0.75rem',
        marginBottom: '0.5rem',
        background: '#1a1a24',
        borderRadius: '4px',
        border: '1px solid #2a2a3a',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.8rem' }}>
          <span style={{ fontWeight: 600, color: '#4dc3ff' }}>@{author}</span>
          <span style={{ color: '#666' }}>{new Date(createdAt).toLocaleString()}</span>
        </div>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{text}</div>
      </div>
    )
  }

  return (
    <div style={{
      marginBottom: '0.5rem',
      background: '#1a1a24',
      borderRadius: '4px',
      border: '1px solid #333',
      overflow: 'hidden',
    }}>
      {/* Collapsed header - always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          background: 'transparent',
          border: 'none',
          color: '#888',
          fontSize: '0.8rem',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '0.7rem' }}>{expanded ? '▼' : '▶'}</span>
        <span>
          Backup comment from <span style={{ color: '#4dc3ff' }}>@{parsed.savedBy}</span>
          {' '}({parsed.field})
        </span>
        <span style={{ marginLeft: 'auto', color: '#666' }}>
          {new Date(createdAt).toLocaleString()}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{
          padding: '0.5rem 0.75rem',
          borderTop: '1px solid #333',
          fontSize: '0.85rem',
        }}>
          <div style={{ color: '#666', marginBottom: '0.5rem', fontSize: '0.75rem' }}>
            Saved in case of conflict - use this to recover your text if it was overwritten
          </div>
          <div style={{
            whiteSpace: 'pre-wrap',
            background: '#0d0d12',
            padding: '0.5rem',
            borderRadius: '3px',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
          }}>
            {parsed.content}
          </div>
        </div>
      )}
    </div>
  )
}
