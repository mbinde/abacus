import { useState, useEffect, FormEvent } from 'react'
import ExecutorHelp, { LabelPollInlineHelp, WebhookInlineHelp } from './ExecutorHelp'
import { apiFetch } from '../lib/api'

// ExecutorHelp is used in the main component for the Setup Guide button

interface Executor {
  name: string
  type: 'label-poll' | 'webhook'
  label?: string
  endpoint?: string
  description?: string
}

interface Props {
  repoOwner: string
  repoName: string
  onBack: () => void
}

export default function ExecutorSettings({ repoOwner, repoName, onBack }: Props) {
  const [executors, setExecutors] = useState<Executor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Executor | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    loadExecutors()
  }, [repoOwner, repoName])

  async function loadExecutors() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/repos/${repoOwner}/${repoName}/executors`)
      if (res.ok) {
        const data = await res.json() as { executors: Executor[] }
        setExecutors(data.executors)
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to load executors')
      }
    } catch {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(executor: Executor) {
    setError(null)
    try {
      const res = await apiFetch(`/api/repos/${repoOwner}/${repoName}/executors/${executor.name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(executor),
      })

      if (res.ok) {
        await loadExecutors()
        setEditing(null)
        setIsNew(false)
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to save executor')
      }
    } catch {
      setError('Failed to save executor')
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete executor "${name}"?`)) return

    setError(null)
    try {
      const res = await apiFetch(`/api/repos/${repoOwner}/${repoName}/executors/${name}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        await loadExecutors()
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to delete executor')
      }
    } catch {
      setError('Failed to delete executor')
    }
  }

  function startNew() {
    setEditing({
      name: '',
      type: 'label-poll',
      label: '',
      description: '',
    })
    setIsNew(true)
  }

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  if (editing) {
    return (
      <ExecutorForm
        executor={editing}
        isNew={isNew}
        onSave={handleSave}
        onCancel={() => { setEditing(null); setIsNew(false) }}
        error={error}
      />
    )
  }

  return (
    <div>
      {showHelp && <ExecutorHelp onClose={() => setShowHelp(false)} />}

      <div className="flex-between mb-3">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>Executors</h2>
          <button
            onClick={() => setShowHelp(true)}
            style={{
              background: '#444',
              padding: '0.25rem 0.5rem',
              fontSize: '0.8rem',
            }}
          >
            Setup Guide
          </button>
        </div>
        <div className="flex">
          <button onClick={onBack} style={{ background: '#444' }}>
            Back
          </button>
          <button onClick={startNew}>
            Add Executor
          </button>
        </div>
      </div>

      {error && <div className="error mb-2">{error}</div>}

      {executors.length === 0 ? (
        <div className="card">
          <p style={{ color: '#888', marginBottom: '0.75rem' }}>
            No executors configured. Executors let you dispatch issues to agents for autonomous implementation.
          </p>
          <p style={{ color: '#888', fontSize: '0.875rem' }}>
            <strong>Label Poll:</strong> Adds a label to dispatched issues. Your agent uses <code>bd list --label=LABEL</code> to find work.<br />
            <strong>Webhook:</strong> POSTs issue details to your endpoint when dispatched.
          </p>
        </div>
      ) : (
        <div>
          {executors.map((executor) => (
            <div key={executor.name} className="card mb-2">
              <div className="flex-between">
                <div>
                  <h3 style={{ marginBottom: '0.25rem' }}>{executor.name}</h3>
                  <div style={{ color: '#888', fontSize: '0.875rem' }}>
                    Type: {executor.type}
                    {executor.type === 'label-poll' && executor.label && (
                      <span> | Label: <code>{executor.label}</code></span>
                    )}
                    {executor.type === 'webhook' && executor.endpoint && (
                      <span> | Endpoint: {executor.endpoint}</span>
                    )}
                  </div>
                  {executor.description && (
                    <div style={{ marginTop: '0.5rem', color: '#aaa' }}>
                      {executor.description}
                    </div>
                  )}
                </div>
                <div className="flex">
                  <button
                    onClick={() => { setEditing(executor); setIsNew(false) }}
                    style={{ background: '#444' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(executor.name)}
                    style={{ background: '#662222' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface FormProps {
  executor: Executor
  isNew: boolean
  onSave: (executor: Executor) => void
  onCancel: () => void
  error: string | null
}

// Validation patterns
const NAME_PATTERN = /^[a-z0-9-]+$/
const LABEL_PATTERN = /^[a-zA-Z0-9:_-]+$/

function validateName(value: string): string | null {
  if (!value) return null
  if (value.includes(' ')) return 'Name cannot contain spaces (use hyphens instead)'
  if (!NAME_PATTERN.test(value)) return 'Name can only contain lowercase letters, numbers, and hyphens'
  return null
}

function validateLabel(value: string): string | null {
  if (!value) return null
  if (value.includes(' ')) return 'Label cannot contain spaces (use hyphens or underscores)'
  if (!LABEL_PATTERN.test(value)) return 'Label can only contain letters, numbers, colons, underscores, and hyphens'
  return null
}

function normalizeForLabel(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function ExecutorForm({ executor, isNew, onSave, onCancel, error }: FormProps) {
  const [name, setName] = useState(executor.name)
  const [type, setType] = useState<'label-poll' | 'webhook'>(executor.type)
  const [label, setLabel] = useState(executor.label || '')
  const [endpoint, setEndpoint] = useState(executor.endpoint || '')
  const [description, setDescription] = useState(executor.description || '')

  // Track if user has manually edited each field
  const [labelTouched, setLabelTouched] = useState(!!executor.label)
  const [nameTouched, setNameTouched] = useState(!!executor.name)

  // Validation errors
  const nameError = validateName(name)
  const labelError = validateLabel(label)

  // Auto-fill label from name
  function handleNameChange(value: string) {
    setName(value)
    setNameTouched(true)

    // Auto-fill label if not manually edited and type is label-poll
    if (!labelTouched && type === 'label-poll' && value) {
      const normalized = normalizeForLabel(value)
      setLabel(`exec:${normalized}`)
    }
  }

  // Auto-fill name from label
  function handleLabelChange(value: string) {
    setLabel(value)
    setLabelTouched(true)

    // Auto-fill name if not manually edited
    if (!nameTouched && value) {
      // Extract name from exec:name pattern
      const match = value.match(/^exec:(.+)$/)
      if (match) {
        const normalized = normalizeForLabel(match[1])
        setName(normalized)
      }
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()

    // Check for validation errors
    if (nameError || (type === 'label-poll' && labelError)) {
      return
    }

    onSave({
      name,
      type,
      label: type === 'label-poll' ? label : undefined,
      endpoint: type === 'webhook' ? endpoint : undefined,
      description: description || undefined,
    })
  }

  return (
    <div className="card">
      <h3 className="mb-2">{isNew ? 'Add Executor' : 'Edit Executor'}</h3>

      {error && <div className="error mb-2">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="mb-2">
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g., home-mac"
            required
            disabled={!isNew}
            style={nameError ? { borderColor: '#ff6b6b' } : undefined}
          />
          {nameError && (
            <div style={{ color: '#ff6b6b', fontSize: '0.75rem', marginTop: '0.25rem' }}>
              {nameError}
            </div>
          )}
          {!nameError && (
            <div style={{ color: '#888', fontSize: '0.75rem', marginTop: '0.25rem' }}>
              Lowercase letters, numbers, and hyphens only
            </div>
          )}
        </div>

        <div className="mb-2">
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <div style={{ flexShrink: 0 }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'label-poll' | 'webhook')}
                style={{ width: 'auto', minWidth: '140px' }}
              >
                <option value="label-poll">Label Poll</option>
                <option value="webhook">Webhook</option>
              </select>
            </div>

            {type === 'label-poll' && (
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
                  Label
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  placeholder="e.g., exec:home-mac"
                  required
                  style={labelError ? { borderColor: '#ff6b6b' } : undefined}
                />
                {labelError && (
                  <div style={{ color: '#ff6b6b', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {labelError}
                  </div>
                )}
                {!labelError && (
                  <div style={{ color: '#888', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    This label is added to the issue when dispatched. Your agent can use <code>bd list --label=LABEL</code> to find dispatched work.
                  </div>
                )}
              </div>
            )}

            {type === 'webhook' && (
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
                  Endpoint URL
                </label>
                <input
                  type="url"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="https://your-server.com/dispatch"
                  required
                />
                <div style={{ color: '#888', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  Abacus will POST to this URL when dispatching issues.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mb-2">
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
            Description (optional)
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., My home MacBook"
          />
        </div>

        <div className="flex mb-2" style={{ justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={{ background: '#444' }}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!!nameError || (type === 'label-poll' && !!labelError)}
          >
            {isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </form>

      <div style={{ marginTop: '1rem' }}>
        {type === 'label-poll' && <LabelPollInlineHelp label={label} />}
        {type === 'webhook' && <WebhookInlineHelp />}
      </div>
    </div>
  )
}
