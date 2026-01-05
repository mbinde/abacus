interface Props {
  type: 'issues' | 'repos' | 'search' | 'starred'
  onAction?: () => void
}

export default function EmptyState({ type, onAction }: Props) {
  const configs = {
    issues: {
      icon: '📋',
      title: 'No issues yet',
      description: 'Get started by creating your first issue to track bugs, features, or tasks.',
      actionLabel: 'Create Issue',
    },
    repos: {
      icon: '📁',
      title: 'No repositories added',
      description: 'Add a GitHub repository to start tracking issues with beads.',
      actionLabel: 'Add Repository',
    },
    search: {
      icon: '🔍',
      title: 'No results found',
      description: 'Try adjusting your search query or filters to find what you\'re looking for.',
      actionLabel: undefined,
    },
    starred: {
      icon: '⭐',
      title: 'No starred issues',
      description: 'Star important issues to quickly access them later. Click the star icon next to any issue.',
      actionLabel: undefined,
    },
  }

  const config = configs[type]

  return (
    <div className="card empty-state">
      <div className="empty-state-icon">{config.icon}</div>
      <div className="empty-state-title">{config.title}</div>
      <div className="empty-state-description">{config.description}</div>
      {config.actionLabel && onAction && (
        <button onClick={onAction} className="empty-state-action">
          {config.actionLabel}
        </button>
      )}
    </div>
  )
}
