import { describe, it, expect } from 'vitest'
import {
  parseJsonlIssues,
  parseMarkdownIssue,
  serializeJsonlIssue,
  serializeMarkdownIssue,
  updateJsonlContent,
  removeFromJsonl,
  generateId,
  type Issue,
} from './beads'

describe('parseJsonlIssues', () => {
  it('parses single line JSONL', () => {
    const content = '{"id":"test-1","title":"Test Issue","status":"open","priority":1,"issue_type":"task","created_at":"2026-01-01T00:00:00Z"}'
    const issues = parseJsonlIssues(content)

    expect(issues).toHaveLength(1)
    expect(issues[0].id).toBe('test-1')
    expect(issues[0].title).toBe('Test Issue')
    expect(issues[0].status).toBe('open')
  })

  it('parses multiple lines', () => {
    const content = `{"id":"test-1","title":"First","status":"open","priority":1,"issue_type":"task","created_at":"2026-01-01T00:00:00Z"}
{"id":"test-2","title":"Second","status":"closed","priority":2,"issue_type":"bug","created_at":"2026-01-02T00:00:00Z"}`
    const issues = parseJsonlIssues(content)

    expect(issues).toHaveLength(2)
    expect(issues[0].title).toBe('First')
    expect(issues[1].title).toBe('Second')
    expect(issues[1].status).toBe('closed')
  })

  it('handles empty lines', () => {
    const content = `{"id":"test-1","title":"First","status":"open","priority":1,"issue_type":"task","created_at":"2026-01-01T00:00:00Z"}

{"id":"test-2","title":"Second","status":"open","priority":1,"issue_type":"task","created_at":"2026-01-01T00:00:00Z"}`
    const issues = parseJsonlIssues(content)

    expect(issues).toHaveLength(2)
  })

  it('normalizes status values', () => {
    const tests = [
      { input: 'open', expected: 'open' },
      { input: 'OPEN', expected: 'open' },
      { input: 'closed', expected: 'closed' },
      { input: 'in_progress', expected: 'in_progress' },
      { input: 'in-progress', expected: 'in_progress' },
      { input: 'unknown', expected: 'open' },
    ]

    for (const { input, expected } of tests) {
      const content = `{"id":"test-1","title":"Test","status":"${input}","priority":1,"issue_type":"task","created_at":"2026-01-01T00:00:00Z"}`
      const issues = parseJsonlIssues(content)
      expect(issues[0].status).toBe(expected)
    }
  })

  it('normalizes issue types', () => {
    const tests = [
      { input: 'bug', expected: 'bug' },
      { input: 'BUG', expected: 'bug' },
      { input: 'feature', expected: 'feature' },
      { input: 'epic', expected: 'epic' },
      { input: 'task', expected: 'task' },
      { input: 'unknown', expected: 'task' },
    ]

    for (const { input, expected } of tests) {
      const content = `{"id":"test-1","title":"Test","status":"open","priority":1,"issue_type":"${input}","created_at":"2026-01-01T00:00:00Z"}`
      const issues = parseJsonlIssues(content)
      expect(issues[0].issue_type).toBe(expected)
    }
  })

  it('handles type field alias for issue_type', () => {
    const content = '{"id":"test-1","title":"Test","status":"open","priority":1,"type":"bug","created_at":"2026-01-01T00:00:00Z"}'
    const issues = parseJsonlIssues(content)

    expect(issues[0].issue_type).toBe('bug')
  })

  it('defaults priority to 3 when missing or invalid', () => {
    const content = '{"id":"test-1","title":"Test","status":"open","issue_type":"task","created_at":"2026-01-01T00:00:00Z"}'
    const issues = parseJsonlIssues(content)

    expect(issues[0].priority).toBe(3)
  })

  it('preserves optional fields', () => {
    const content = '{"id":"test-1","title":"Test","description":"A description","status":"open","priority":1,"issue_type":"task","created_at":"2026-01-01T00:00:00Z","parent":"parent-1"}'
    const issues = parseJsonlIssues(content)

    expect(issues[0].description).toBe('A description')
    expect(issues[0].parent).toBe('parent-1')
  })

  it('preserves links array', () => {
    const content = '{"id":"test-1","title":"Test","status":"open","priority":1,"issue_type":"task","created_at":"2026-01-01T00:00:00Z","links":[{"type":"pr","url":"https://github.com/repo/pull/1","number":1}]}'
    const issues = parseJsonlIssues(content)

    expect(issues[0].links).toHaveLength(1)
    expect(issues[0].links![0].type).toBe('pr')
    expect(issues[0].links![0].number).toBe(1)
  })
})

describe('parseMarkdownIssue', () => {
  it('parses markdown with YAML frontmatter', () => {
    const content = `---
id: test-1
title: "Test Issue"
type: bug
status: open
priority: 1
created: 2026-01-01
---

# Test Issue

This is the description.`

    const issue = parseMarkdownIssue(content)

    expect(issue.id).toBe('test-1')
    expect(issue.title).toBe('Test Issue')
    expect(issue.issue_type).toBe('bug')
    expect(issue.status).toBe('open')
    expect(issue.priority).toBe(1)
    expect(issue.description).toBe('# Test Issue\n\nThis is the description.')
  })

  it('handles frontmatter without quotes', () => {
    const content = `---
id: test-1
title: Simple Title
type: task
status: open
priority: 2
created: 2026-01-01
---

Description here.`

    const issue = parseMarkdownIssue(content)

    expect(issue.title).toBe('Simple Title')
  })

  it('throws on invalid markdown format', () => {
    const content = 'No frontmatter here'

    expect(() => parseMarkdownIssue(content)).toThrow('Invalid markdown format')
  })

  it('handles empty body', () => {
    const content = `---
id: test-1
title: No Body
type: task
status: open
priority: 1
created: 2026-01-01
---`

    const issue = parseMarkdownIssue(content)

    // Empty body results in undefined description (not empty string)
    expect(issue.description).toBeUndefined()
  })
})

describe('serializeJsonlIssue', () => {
  it('serializes issue to JSON string', () => {
    const issue: Issue = {
      id: 'test-1',
      title: 'Test Issue',
      status: 'open',
      priority: 1,
      issue_type: 'task',
      created_at: '2026-01-01T00:00:00Z',
    }

    const serialized = serializeJsonlIssue(issue)
    const parsed = JSON.parse(serialized)

    expect(parsed.id).toBe('test-1')
    expect(parsed.title).toBe('Test Issue')
    expect(parsed.status).toBe('open')
    expect(parsed.priority).toBe(1)
    expect(parsed.issue_type).toBe('task')
  })

  it('defaults empty description to empty string', () => {
    const issue: Issue = {
      id: 'test-1',
      title: 'Test',
      status: 'open',
      priority: 1,
      issue_type: 'task',
      created_at: '2026-01-01T00:00:00Z',
    }

    const serialized = serializeJsonlIssue(issue)
    const parsed = JSON.parse(serialized)

    expect(parsed.description).toBe('')
  })

  it('adds updated_at timestamp', () => {
    const issue: Issue = {
      id: 'test-1',
      title: 'Test',
      status: 'open',
      priority: 1,
      issue_type: 'task',
      created_at: '2026-01-01T00:00:00Z',
    }

    const serialized = serializeJsonlIssue(issue)
    const parsed = JSON.parse(serialized)

    expect(parsed.updated_at).toBeDefined()
  })
})

describe('serializeMarkdownIssue', () => {
  it('serializes issue to markdown format', () => {
    const issue: Issue = {
      id: 'test-1',
      title: 'Test Issue',
      description: 'A description',
      status: 'open',
      priority: 1,
      issue_type: 'bug',
      created_at: '2026-01-01T00:00:00Z',
    }

    const markdown = serializeMarkdownIssue(issue)

    expect(markdown).toContain('---')
    expect(markdown).toContain('id: test-1')
    expect(markdown).toContain('title: "Test Issue"')
    expect(markdown).toContain('type: bug')
    expect(markdown).toContain('status: open')
    expect(markdown).toContain('priority: 1')
    expect(markdown).toContain('# Test Issue')
    expect(markdown).toContain('A description')
  })

  it('escapes quotes in title', () => {
    const issue: Issue = {
      id: 'test-1',
      title: 'Test "Quoted" Issue',
      status: 'open',
      priority: 1,
      issue_type: 'task',
      created_at: '2026-01-01T00:00:00Z',
    }

    const markdown = serializeMarkdownIssue(issue)

    expect(markdown).toContain('title: "Test \\"Quoted\\" Issue"')
  })

  it('includes parent when present', () => {
    const issue: Issue = {
      id: 'test-1',
      title: 'Child Issue',
      status: 'open',
      priority: 1,
      issue_type: 'task',
      created_at: '2026-01-01T00:00:00Z',
      parent: 'parent-1',
    }

    const markdown = serializeMarkdownIssue(issue)

    expect(markdown).toContain('parent: parent-1')
  })
})

describe('updateJsonlContent', () => {
  it('updates existing issue', () => {
    const content = `{"id":"test-1","title":"Original","status":"open","priority":1,"issue_type":"task","created_at":"2026-01-01T00:00:00Z"}
{"id":"test-2","title":"Other","status":"open","priority":1,"issue_type":"task","created_at":"2026-01-01T00:00:00Z"}`

    const updatedIssue: Issue = {
      id: 'test-1',
      title: 'Updated',
      status: 'closed',
      priority: 1,
      issue_type: 'task',
      created_at: '2026-01-01T00:00:00Z',
    }

    const result = updateJsonlContent(content, updatedIssue)
    const lines = result.trim().split('\n')

    expect(lines).toHaveLength(2)

    const updated = JSON.parse(lines[0])
    expect(updated.title).toBe('Updated')
    expect(updated.status).toBe('closed')

    const other = JSON.parse(lines[1])
    expect(other.id).toBe('test-2')
    expect(other.title).toBe('Other')
  })

  it('appends new issue when not found', () => {
    const content = '{"id":"test-1","title":"Existing","status":"open","priority":1,"issue_type":"task","created_at":"2026-01-01T00:00:00Z"}'

    const newIssue: Issue = {
      id: 'test-2',
      title: 'New',
      status: 'open',
      priority: 1,
      issue_type: 'task',
      created_at: '2026-01-01T00:00:00Z',
    }

    const result = updateJsonlContent(content, newIssue)
    const lines = result.trim().split('\n')

    expect(lines).toHaveLength(2)

    const second = JSON.parse(lines[1])
    expect(second.id).toBe('test-2')
    expect(second.title).toBe('New')
  })
})

describe('removeFromJsonl', () => {
  it('removes issue by id', () => {
    const content = `{"id":"test-1","title":"First","status":"open","priority":1,"issue_type":"task","created_at":"2026-01-01T00:00:00Z"}
{"id":"test-2","title":"Second","status":"open","priority":1,"issue_type":"task","created_at":"2026-01-01T00:00:00Z"}
{"id":"test-3","title":"Third","status":"open","priority":1,"issue_type":"task","created_at":"2026-01-01T00:00:00Z"}`

    const result = removeFromJsonl(content, 'test-2')
    const lines = result.trim().split('\n')

    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]).id).toBe('test-1')
    expect(JSON.parse(lines[1]).id).toBe('test-3')
  })

  it('returns unchanged content when id not found', () => {
    const content = '{"id":"test-1","title":"Only","status":"open","priority":1,"issue_type":"task","created_at":"2026-01-01T00:00:00Z"}'

    const result = removeFromJsonl(content, 'nonexistent')
    const lines = result.trim().split('\n')

    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]).id).toBe('test-1')
  })
})

describe('generateId', () => {
  it('generates id with prefix', () => {
    const id = generateId('test')

    expect(id).toMatch(/^test-[a-z0-9]{3}$/)
  })

  it('generates unique ids', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      ids.add(generateId('test'))
    }

    // With 36^3 = 46656 possible combinations, 100 should be unique
    // (birthday paradox gives ~0.1% collision chance)
    expect(ids.size).toBeGreaterThan(95)
  })

  it('works with different prefixes', () => {
    const prefixes = ['bd', 'proj', 'my-project']

    for (const prefix of prefixes) {
      const id = generateId(prefix)
      expect(id.startsWith(`${prefix}-`)).toBe(true)
    }
  })
})

describe('round-trip serialization', () => {
  it('JSONL round-trip preserves data', () => {
    const original: Issue = {
      id: 'test-1',
      title: 'Test Issue',
      description: 'A description',
      status: 'in_progress',
      priority: 2,
      issue_type: 'feature',
      created_at: '2026-01-01T00:00:00Z',
      parent: 'parent-1',
    }

    const serialized = serializeJsonlIssue(original)
    const parsed = parseJsonlIssues(serialized)[0]

    expect(parsed.id).toBe(original.id)
    expect(parsed.title).toBe(original.title)
    expect(parsed.description).toBe(original.description)
    expect(parsed.status).toBe(original.status)
    expect(parsed.priority).toBe(original.priority)
    expect(parsed.issue_type).toBe(original.issue_type)
  })
})
