import { useState, useEffect } from 'react'

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
  issueId: string
  onDispatched?: () => void
}

export default function DispatchButton({ repoOwner, repoName, issueId, onDispatched }: Props) {
  const [executors, setExecutors] = useState<Executor[]>([])
  const [loading, setLoading] = useState(true)
  const [dispatching, setDispatching] = useState(false)
  const [selectedExecutor, setSelectedExecutor] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    loadExecutors()
  }, [repoOwner, repoName])

  async function loadExecutors() {
    try {
      const res = await fetch(`/api/repos/${repoOwner}/${repoName}/executors`)
      if (res.ok) {
        const data = await res.json() as { executors: Executor[] }
        setExecutors(data.executors)
        if (data.executors.length > 0) {
          setSelectedExecutor(data.executors[0].name)
        }
      }
    } catch {
      // Silently fail - executors are optional
    } finally {
      setLoading(false)
    }
  }

  async function handleDispatch() {
    if (!selectedExecutor) return

    setDispatching(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(
        `/api/repos/${repoOwner}/${repoName}/executors/${selectedExecutor}/dispatch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ issue_id: issueId }),
        }
      )

      if (res.ok) {
        const data = await res.json() as { status: string; type: string; label_applied?: string }
        setSuccess(`Dispatched via ${data.type}${data.label_applied ? ` (label: ${data.label_applied})` : ''}`)
        onDispatched?.()
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to dispatch')
      }
    } catch {
      setError('Failed to dispatch')
    } finally {
      setDispatching(false)
    }
  }

  if (loading) {
    return null
  }

  if (executors.length === 0) {
    return null
  }

  return (
    <div style={{
      marginTop: '1rem',
      padding: '1rem',
      background: '#1a1a24',
      borderRadius: '4px',
      border: '1px solid #2a2a3a'
    }}>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
        Dispatch to Agent
      </div>

      {error && (
        <div style={{ color: '#ff6b6b', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ color: '#4caf50', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
          {success}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <select
          value={selectedExecutor}
          onChange={(e) => setSelectedExecutor(e.target.value)}
          disabled={dispatching}
          style={{ flex: 1 }}
        >
          {executors.map((exec) => (
            <option key={exec.name} value={exec.name}>
              {exec.name} ({exec.type})
            </option>
          ))}
        </select>
        <button
          onClick={handleDispatch}
          disabled={dispatching || !selectedExecutor}
        >
          {dispatching ? 'Dispatching...' : 'Dispatch'}
        </button>
      </div>

      {selectedExecutor && (
        <div style={{ color: '#888', fontSize: '0.75rem', marginTop: '0.5rem' }}>
          {executors.find(e => e.name === selectedExecutor)?.description ||
           `Will ${executors.find(e => e.name === selectedExecutor)?.type === 'label-poll' ? 'add label' : 'call webhook'}`}
        </div>
      )}
    </div>
  )
}
