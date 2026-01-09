// Input validation helpers for security

// Length limits
export const LIMITS = {
  ISSUE_TITLE_MAX: 256,
  ISSUE_DESCRIPTION_MAX: 65536,
  COMMENT_TEXT_MAX: 32768,
  REPO_OWNER_MAX: 39,  // GitHub limit
  REPO_NAME_MAX: 100,  // GitHub limit
  EMAIL_MAX: 254,
}

// Validation result type
export interface ValidationResult {
  valid: boolean
  error?: string
}

// Validate repo owner/name format (GitHub username rules)
const REPO_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/

export function validateRepoOwner(owner: string): ValidationResult {
  if (!owner || typeof owner !== 'string') {
    return { valid: false, error: 'Repository owner is required' }
  }
  if (owner.length > LIMITS.REPO_OWNER_MAX) {
    return { valid: false, error: `Repository owner cannot exceed ${LIMITS.REPO_OWNER_MAX} characters` }
  }
  if (!REPO_NAME_PATTERN.test(owner)) {
    return { valid: false, error: 'Repository owner contains invalid characters' }
  }
  if (owner.startsWith('-') || owner.endsWith('-')) {
    return { valid: false, error: 'Repository owner cannot start or end with a hyphen' }
  }
  return { valid: true }
}

export function validateRepoName(name: string): ValidationResult {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Repository name is required' }
  }
  if (name.length > LIMITS.REPO_NAME_MAX) {
    return { valid: false, error: `Repository name cannot exceed ${LIMITS.REPO_NAME_MAX} characters` }
  }
  if (!REPO_NAME_PATTERN.test(name)) {
    return { valid: false, error: 'Repository name contains invalid characters' }
  }
  // Block path traversal attempts
  if (name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    return { valid: false, error: 'Repository name contains invalid characters' }
  }
  return { valid: true }
}

// Validate issue title
export function validateIssueTitle(title: string): ValidationResult {
  if (!title || typeof title !== 'string') {
    return { valid: false, error: 'Issue title is required' }
  }
  const trimmed = title.trim()
  if (trimmed.length === 0) {
    return { valid: false, error: 'Issue title cannot be empty' }
  }
  if (trimmed.length > LIMITS.ISSUE_TITLE_MAX) {
    return { valid: false, error: `Issue title cannot exceed ${LIMITS.ISSUE_TITLE_MAX} characters` }
  }
  return { valid: true }
}

// Validate issue description (optional but size-limited)
export function validateIssueDescription(description: string | undefined): ValidationResult {
  if (description === undefined || description === null || description === '') {
    return { valid: true }  // Optional field
  }
  if (typeof description !== 'string') {
    return { valid: false, error: 'Issue description must be a string' }
  }
  if (description.length > LIMITS.ISSUE_DESCRIPTION_MAX) {
    return { valid: false, error: `Issue description cannot exceed ${LIMITS.ISSUE_DESCRIPTION_MAX} characters` }
  }
  return { valid: true }
}

// Validate comment text
export function validateCommentText(text: string): ValidationResult {
  if (!text || typeof text !== 'string') {
    return { valid: false, error: 'Comment text is required' }
  }
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return { valid: false, error: 'Comment text cannot be empty' }
  }
  if (trimmed.length > LIMITS.COMMENT_TEXT_MAX) {
    return { valid: false, error: `Comment text cannot exceed ${LIMITS.COMMENT_TEXT_MAX} characters` }
  }
  return { valid: true }
}

// Validate email format (more comprehensive than basic regex)
export function validateEmail(email: string): ValidationResult {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' }
  }
  if (email.length > LIMITS.EMAIL_MAX) {
    return { valid: false, error: `Email cannot exceed ${LIMITS.EMAIL_MAX} characters` }
  }
  // RFC 5322 simplified email validation
  const emailPattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  if (!emailPattern.test(email)) {
    return { valid: false, error: 'Invalid email format' }
  }
  return { valid: true }
}

// Validate issue status
export function validateIssueStatus(status: string): ValidationResult {
  const validStatuses = ['open', 'closed', 'in_progress']
  if (!validStatuses.includes(status)) {
    return { valid: false, error: 'Invalid status. Must be "open", "closed", or "in_progress"' }
  }
  return { valid: true }
}

// Validate issue priority (1-5)
export function validateIssuePriority(priority: number): ValidationResult {
  if (typeof priority !== 'number' || !Number.isInteger(priority)) {
    return { valid: false, error: 'Priority must be an integer' }
  }
  if (priority < 1 || priority > 5) {
    return { valid: false, error: 'Priority must be between 1 and 5' }
  }
  return { valid: true }
}

// Validate issue type
export function validateIssueType(type: string): ValidationResult {
  const validTypes = ['bug', 'feature', 'task', 'epic']
  if (!validTypes.includes(type)) {
    return { valid: false, error: 'Invalid issue type. Must be "bug", "feature", "task", or "epic"' }
  }
  return { valid: true }
}

// Validate issue ID format
export function validateIssueId(id: string): ValidationResult {
  if (!id || typeof id !== 'string') {
    return { valid: false, error: 'Issue ID is required' }
  }
  // Issue IDs are prefix-xxx format
  const idPattern = /^[a-z0-9]+-[a-z0-9]{3}$/
  if (!idPattern.test(id)) {
    return { valid: false, error: 'Invalid issue ID format' }
  }
  return { valid: true }
}
