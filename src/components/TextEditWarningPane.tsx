import { useState } from 'react'

interface Props {
  lastModified?: string
  backupEnabled: boolean
  onBackupToggle: (enabled: boolean) => void
  onConvertToComment?: () => void
}

function getRecencyRisk(updatedAt: string): 'high' | 'medium' | 'low' {
  const minutesAgo = (Date.now() - new Date(updatedAt).getTime()) / 60000
  if (minutesAgo < 5) return 'high'
  if (minutesAgo < 30) return 'medium'
  return 'low'
}

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export default function TextEditWarningPane({ lastModified, backupEnabled, onBackupToggle, onConvertToComment }: Props) {
  const [collapsed, setCollapsed] = useState(false)

  const risk = lastModified ? getRecencyRisk(lastModified) : 'low'
  const riskColor = risk === 'high' ? '#ef4444' : risk === 'medium' ? '#f59e0b' : '#888'

  return (
    <div style={{
      background: '#1a1a24',
      border: '1px solid #f59e0b',
      borderRadius: '4px',
      marginBottom: '1rem',
      overflow: 'hidden'
    }}>
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.75rem',
          background: 'transparent',
          border: 'none',
          color: '#f59e0b',
          fontWeight: 600,
          cursor: 'pointer',
          textAlign: 'left'
        }}
      >
        <span style={{ fontSize: '0.75rem' }}>{collapsed ? '▶' : '▼'}</span>
        Text Edit Warning
      </button>

      {/* Collapsible content */}
      {!collapsed && (
        <div style={{ padding: '0 0.75rem 0.75rem 0.75rem' }}>
          {onConvertToComment && (
            <button
              type="button"
              onClick={onConvertToComment}
              style={{
                background: '#166534',
                border: 'none',
                color: '#fff',
                padding: '0.5rem 0.75rem',
                borderRadius: '4px',
                fontSize: '0.85rem',
                cursor: 'pointer',
                marginBottom: '0.75rem',
              }}
            >
              Convert to comment instead (safer)
            </button>
          )}

          <p style={{ margin: '0 0 0.75rem 0', color: '#ccc', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Beads uses "last write wins" for text fields — if someone else (human or AI) edits
            this at the same time, your changes may be silently overwritten. Recovery requires
            digging through git history.
          </p>

          <label style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.5rem',
            cursor: 'pointer',
            marginBottom: '0.75rem'
          }}>
            <input
              type="checkbox"
              checked={backupEnabled}
              onChange={(e) => onBackupToggle(e.target.checked)}
              style={{ marginTop: '0.2rem' }}
            />
            <span style={{ color: '#ccc', fontSize: '0.9rem' }}>
              Save a copy of my changes as a comment
              <span style={{ display: 'block', color: '#888', fontSize: '0.8rem' }}>
                (Easier manual recovery if overwritten)
              </span>
            </span>
          </label>

          {lastModified && (
            <div style={{ color: riskColor, fontSize: '0.85rem' }}>
              Last modified: {formatRelativeTime(lastModified)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
