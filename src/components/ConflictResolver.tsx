import { useState } from 'react'

type EditableField = 'title' | 'description' | 'status' | 'priority' | 'issue_type' | 'assignee'

interface FieldConflict {
  field: EditableField
  baseValue: unknown
  localValue: unknown
  remoteValue: unknown
  remoteUpdatedAt: string
}

interface Props {
  conflicts: FieldConflict[]
  autoMergedFields: EditableField[]
  onResolve: (resolutions: Record<EditableField, 'local' | 'remote'>) => void
  onDiscardLocal: () => void
  onForceLocal: () => void
  onCancel: () => void
}

const FIELD_LABELS: Record<EditableField, string> = {
  title: 'Title',
  description: 'Description',
  status: 'Status',
  priority: 'Priority',
  issue_type: 'Type',
  assignee: 'Assignee'
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '(empty)'
  if (typeof value === 'number') return String(value)
  return String(value)
}

function formatTimestamp(timestamp: string): string {
  if (!timestamp) return 'unknown time'
  try {
    return new Date(timestamp).toLocaleString()
  } catch {
    return timestamp
  }
}

export default function ConflictResolver({
  conflicts,
  autoMergedFields,
  onResolve,
  onDiscardLocal,
  onForceLocal,
  onCancel
}: Props) {
  // Track user's choice for each conflict - default to remote (beads strategy: newer timestamp wins)
  const [resolutions, setResolutions] = useState<Record<EditableField, 'local' | 'remote'>>(() => {
    const initial: Record<EditableField, 'local' | 'remote'> = {} as Record<EditableField, 'local' | 'remote'>
    for (const c of conflicts) {
      initial[c.field] = 'remote'
    }
    return initial
  })

  return (
    <div className="card" style={{ border: '2px solid #f59e0b', maxWidth: '800px', margin: '0 auto' }}>
      {/* Warning header */}
      <div style={{
        background: '#78350f',
        padding: '1rem',
        margin: '-1rem -1rem 1rem -1rem',
        borderRadius: '4px 4px 0 0'
      }}>
        <h3 style={{ color: '#fef3c7', margin: 0 }}>
          Merge Conflict Detected
        </h3>
        <p style={{ color: '#fde68a', margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
          Someone else modified this issue while you were editing.
          Please review the conflicts below and choose which values to keep.
        </p>
      </div>

      {/* Auto-merged fields notification */}
      {autoMergedFields.length > 0 && (
        <div style={{
          background: '#1a1a24',
          padding: '0.75rem',
          marginBottom: '1rem',
          borderRadius: '4px',
          fontSize: '0.9rem'
        }}>
          <strong style={{ color: '#4ade80' }}>Auto-merged (no conflicts):</strong>{' '}
          {autoMergedFields.map(f => FIELD_LABELS[f]).join(', ')}
        </div>
      )}

      {/* Conflict list */}
      <div style={{ marginBottom: '1rem' }}>
        <h4 style={{ marginBottom: '0.75rem' }}>Conflicting Fields ({conflicts.length})</h4>

        {conflicts.map(conflict => (
          <div
            key={conflict.field}
            style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              background: '#1a1a24',
              borderRadius: '4px'
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
              {FIELD_LABELS[conflict.field]}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {/* Local option */}
              <div
                onClick={() => setResolutions(prev => ({ ...prev, [conflict.field]: 'local' }))}
                style={{
                  padding: '0.75rem',
                  background: resolutions[conflict.field] === 'local' ? '#1e3a5f' : '#2a2a3a',
                  border: resolutions[conflict.field] === 'local' ? '2px solid #3b82f6' : '1px solid #444',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>
                  Your change
                </div>
                <div style={{
                  fontFamily: 'monospace',
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                  maxHeight: '100px',
                  overflow: 'auto'
                }}>
                  {formatValue(conflict.localValue)}
                </div>
              </div>

              {/* Remote option */}
              <div
                onClick={() => setResolutions(prev => ({ ...prev, [conflict.field]: 'remote' }))}
                style={{
                  padding: '0.75rem',
                  background: resolutions[conflict.field] === 'remote' ? '#1e3a5f' : '#2a2a3a',
                  border: resolutions[conflict.field] === 'remote' ? '2px solid #3b82f6' : '1px solid #444',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>
                  Their change ({formatTimestamp(conflict.remoteUpdatedAt)})
                </div>
                <div style={{
                  fontFamily: 'monospace',
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                  maxHeight: '100px',
                  overflow: 'auto'
                }}>
                  {formatValue(conflict.remoteValue)}
                </div>
              </div>
            </div>

            {/* Base value for context */}
            <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
              Original value: {formatValue(conflict.baseValue)}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex" style={{ justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{ background: '#444' }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onDiscardLocal}
          style={{ background: '#7f1d1d' }}
        >
          Discard My Changes
        </button>
        <button
          type="button"
          onClick={onForceLocal}
          style={{ background: '#854d0e' }}
        >
          Force My Version
        </button>
        <button
          type="button"
          onClick={() => onResolve(resolutions)}
        >
          Save Merged Version
        </button>
      </div>
    </div>
  )
}
