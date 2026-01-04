// Beads format parsing and serialization

export interface Issue {
  id: string
  title: string
  description?: string
  status: 'open' | 'closed' | 'in_progress'
  priority: number
  issue_type: 'bug' | 'feature' | 'task' | 'epic'
  created_at: string
  updated_at?: string
  closed_at?: string
  parent?: string
}

// Parse JSONL format (one JSON object per line)
export function parseJsonlIssues(content: string): Issue[] {
  const lines = content.trim().split('\n').filter(line => line.trim())
  return lines.map(line => {
    const obj = JSON.parse(line)
    return normalizeIssue(obj)
  })
}

// Parse markdown format with YAML frontmatter
export function parseMarkdownIssue(content: string): Issue {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) {
    throw new Error('Invalid markdown format: missing frontmatter')
  }

  const [, frontmatter, body] = match
  const meta = parseYamlFrontmatter(frontmatter)

  return normalizeIssue({
    ...meta,
    description: body.trim(),
  })
}

function parseYamlFrontmatter(yaml: string): Record<string, string | number> {
  const result: Record<string, string | number> = {}
  for (const line of yaml.split('\n')) {
    const match = line.match(/^(\w+):\s*(.*)$/)
    if (match) {
      const [, key, value] = match
      // Remove quotes if present
      const cleaned = value.replace(/^["']|["']$/g, '')
      // Try to parse as number
      const num = Number(cleaned)
      result[key] = isNaN(num) ? cleaned : num
    }
  }
  return result
}

function normalizeIssue(obj: Record<string, unknown>): Issue {
  return {
    id: String(obj.id || ''),
    title: String(obj.title || ''),
    description: obj.description ? String(obj.description) : undefined,
    status: normalizeStatus(obj.status),
    priority: Number(obj.priority) || 3,
    issue_type: normalizeType(obj.issue_type || obj.type),
    created_at: String(obj.created_at || obj.created || new Date().toISOString()),
    updated_at: obj.updated_at ? String(obj.updated_at) : undefined,
    closed_at: obj.closed_at ? String(obj.closed_at) : undefined,
    parent: obj.parent ? String(obj.parent) : undefined,
  }
}

function normalizeStatus(status: unknown): Issue['status'] {
  const s = String(status || 'open').toLowerCase()
  if (s === 'closed') return 'closed'
  if (s === 'in_progress' || s === 'in-progress') return 'in_progress'
  return 'open'
}

function normalizeType(type: unknown): Issue['issue_type'] {
  const t = String(type || 'task').toLowerCase()
  if (t === 'bug') return 'bug'
  if (t === 'feature') return 'feature'
  if (t === 'epic') return 'epic'
  return 'task'
}

// Serialize issue to JSONL line
export function serializeJsonlIssue(issue: Issue): string {
  return JSON.stringify({
    id: issue.id,
    title: issue.title,
    description: issue.description || '',
    status: issue.status,
    priority: issue.priority,
    issue_type: issue.issue_type,
    created_at: issue.created_at,
    updated_at: issue.updated_at || new Date().toISOString(),
    closed_at: issue.closed_at,
  })
}

// Serialize issue to markdown format
export function serializeMarkdownIssue(issue: Issue): string {
  const frontmatter = [
    '---',
    `id: ${issue.id}`,
    `title: "${issue.title.replace(/"/g, '\\"')}"`,
    `type: ${issue.issue_type}`,
    `status: ${issue.status}`,
    `priority: ${issue.priority}`,
    `created: ${issue.created_at.split('T')[0]}`,
  ]

  if (issue.parent) {
    frontmatter.push(`parent: ${issue.parent}`)
  }

  frontmatter.push('---')
  frontmatter.push('')
  frontmatter.push(`# ${issue.title}`)
  frontmatter.push('')

  if (issue.description) {
    frontmatter.push(issue.description)
    frontmatter.push('')
  }

  return frontmatter.join('\n')
}

// Generate a beads-style hash ID
export function generateId(prefix: string): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz'
  let hash = ''
  for (let i = 0; i < 3; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)]
  }
  return `${prefix}-${hash}`
}

// Update a JSONL file with a modified issue
export function updateJsonlContent(content: string, issue: Issue): string {
  const lines = content.trim().split('\n')
  const newLines: string[] = []
  let found = false

  for (const line of lines) {
    if (!line.trim()) continue
    const obj = JSON.parse(line)
    if (obj.id === issue.id) {
      newLines.push(serializeJsonlIssue(issue))
      found = true
    } else {
      newLines.push(line)
    }
  }

  if (!found) {
    newLines.push(serializeJsonlIssue(issue))
  }

  return newLines.join('\n') + '\n'
}

// Remove an issue from JSONL content (for soft delete, add to deletions.jsonl instead)
export function removeFromJsonl(content: string, issueId: string): string {
  const lines = content.trim().split('\n')
  const newLines = lines.filter(line => {
    if (!line.trim()) return false
    const obj = JSON.parse(line)
    return obj.id !== issueId
  })
  return newLines.join('\n') + '\n'
}
