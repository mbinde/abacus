interface User {
  login: string
  name: string | null
  avatarUrl: string
  role: string
}

interface Props {
  user: User
  onNavigate: (view: string) => void
  onLogout: () => void
}

export default function Header({ user, onNavigate, onLogout }: Props) {
  return (
    <header className="flex-between mb-3">
      <h1
        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
        onClick={() => onNavigate('list')}
      >
        <img src="/favicon-96x96.png" alt="" style={{ width: 48, height: 48 }} />
        <span style={{ color: 'inherit', textDecoration: 'none' }}>Abacus</span>
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {user.role === 'admin' && (
          <button onClick={() => onNavigate('admin')}>
            Admin
          </button>
        )}
        <div
          onClick={() => onNavigate('profile')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
          title="View profile"
        >
          <img
            src={user.avatarUrl}
            alt={user.login}
            style={{ width: 28, height: 28, borderRadius: '50%' }}
          />
          <span style={{ fontSize: '0.875rem' }}>{user.name || user.login}</span>
        </div>
        <button onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  )
}
