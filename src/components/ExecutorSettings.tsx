import { useState, useEffect, FormEvent } from 'react'

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
      const res = await fetch(`/api/repos/${repoOwner}/${repoName}/executors/${executor.name}`, {
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
      const res = await fetch(`/api/repos/${repoOwner}/${repoName}/executors/${name}`, {
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
      <div className="flex-between mb-3">
        <h2>Executors</h2>
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
          <p style={{ color: '#888' }}>
            No executors configured. Executors let you dispatch issues to agents for autonomous implementation.
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

function ExecutorForm({ executor, isNew, onSave, onCancel, error }: FormProps) {
  const [name, setName] = useState(executor.name)
  const [type, setType] = useState<'label-poll' | 'webhook'>(executor.type)
  const [label, setLabel] = useState(executor.label || '')
  const [endpoint, setEndpoint] = useState(executor.endpoint || '')
  const [description, setDescription] = useState(executor.description || '')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
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
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., home-mac"
            required
            disabled={!isNew}
            pattern="[a-z0-9-]+"
            title="Lowercase letters, numbers, and hyphens only"
          />
        </div>

        <div className="mb-2">
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
            Type
          </label>
          <select value={type} onChange={(e) => setType(e.target.value as 'label-poll' | 'webhook')}>
            <option value="label-poll">Label Poll</option>
            <option value="webhook">Webhook</option>
          </select>
        </div>

        {type === 'label-poll' && (
          <div className="mb-2">
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
              Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., exec:home-mac"
              required
            />
            <div style={{ color: '#888', fontSize: '0.75rem', marginTop: '0.25rem' }}>
              This label will be added to issues when dispatched. Your polling agent should watch for this label.
            </div>
          </div>
        )}

        {type === 'webhook' && (
          <div className="mb-2">
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

        <div className="flex" style={{ justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={{ background: '#444' }}>
            Cancel
          </button>
          <button type="submit">
            {isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
