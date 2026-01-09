import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Header from './Header'

describe('Header', () => {
  const mockOnNavigate = vi.fn()
  const mockOnLogout = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('branding', () => {
    it('renders Abacus title', () => {
      render(<Header user={null} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      expect(screen.getByText('Abacus')).toBeInTheDocument()
    })

    it('renders logo image', () => {
      const { container } = render(<Header user={null} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      const logo = container.querySelector('img[src="/favicon-96x96.png"]')
      expect(logo).toBeInTheDocument()
    })

    it('navigates to list when title clicked', () => {
      render(<Header user={null} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      fireEvent.click(screen.getByText('Abacus'))

      expect(mockOnNavigate).toHaveBeenCalledWith('list')
    })

    it('navigates to list when logo clicked', () => {
      const { container } = render(<Header user={null} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      const logo = container.querySelector('img[src="/favicon-96x96.png"]')
      fireEvent.click(logo!)

      expect(mockOnNavigate).toHaveBeenCalledWith('list')
    })
  })

  describe('unauthenticated state', () => {
    it('shows Sign in with GitHub button when no user', () => {
      render(<Header user={null} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeInTheDocument()
    })

    it('does not show logout button when no user', () => {
      render(<Header user={null} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument()
    })

    it('does not show Admin button when no user', () => {
      render(<Header user={null} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument()
    })

    it('links Sign in button to GitHub auth', () => {
      render(<Header user={null} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      const link = screen.getByRole('link')
      expect(link).toHaveAttribute('href', '/api/auth/github')
    })
  })

  describe('authenticated state', () => {
    const mockUser = {
      login: 'alice',
      name: 'Alice Smith',
      avatarUrl: 'https://avatars.githubusercontent.com/u/12345',
      role: 'user',
    }

    it('shows user avatar', () => {
      render(<Header user={mockUser} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      const avatar = screen.getByRole('img', { name: 'alice' })
      expect(avatar).toHaveAttribute('src', mockUser.avatarUrl)
    })

    it('shows user display name', () => {
      render(<Header user={mockUser} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    })

    it('shows login when name is null', () => {
      const userWithoutName = { ...mockUser, name: null }

      render(<Header user={userWithoutName} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      expect(screen.getByText('alice')).toBeInTheDocument()
    })

    it('shows Logout button', () => {
      render(<Header user={mockUser} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument()
    })

    it('does not show Sign in button', () => {
      render(<Header user={mockUser} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      expect(screen.queryByRole('button', { name: 'Sign in with GitHub' })).not.toBeInTheDocument()
    })

    it('calls onLogout when Logout clicked', () => {
      render(<Header user={mockUser} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      fireEvent.click(screen.getByRole('button', { name: 'Logout' }))

      expect(mockOnLogout).toHaveBeenCalled()
    })

    it('navigates to profile when avatar clicked', () => {
      render(<Header user={mockUser} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      const avatar = screen.getByRole('img', { name: 'alice' })
      fireEvent.click(avatar)

      expect(mockOnNavigate).toHaveBeenCalledWith('profile')
    })

    it('navigates to profile when name clicked', () => {
      render(<Header user={mockUser} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      fireEvent.click(screen.getByText('Alice Smith'))

      expect(mockOnNavigate).toHaveBeenCalledWith('profile')
    })
  })

  describe('admin role', () => {
    const adminUser = {
      login: 'admin',
      name: 'Admin User',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1',
      role: 'admin',
    }

    it('shows Admin button for admin users', () => {
      render(<Header user={adminUser} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument()
    })

    it('navigates to admin when Admin clicked', () => {
      render(<Header user={adminUser} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }))

      expect(mockOnNavigate).toHaveBeenCalledWith('admin')
    })
  })

  describe('non-admin roles', () => {
    it('does not show Admin button for user role', () => {
      const regularUser = {
        login: 'user1',
        name: 'Regular User',
        avatarUrl: 'https://avatars.githubusercontent.com/u/2',
        role: 'user',
      }

      render(<Header user={regularUser} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument()
    })

    it('does not show Admin button for premium role', () => {
      const premiumUser = {
        login: 'premium1',
        name: 'Premium User',
        avatarUrl: 'https://avatars.githubusercontent.com/u/3',
        role: 'premium',
      }

      render(<Header user={premiumUser} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument()
    })

    it('does not show Admin button for guest role', () => {
      const guestUser = {
        login: 'guest1',
        name: 'Guest User',
        avatarUrl: 'https://avatars.githubusercontent.com/u/4',
        role: 'guest',
      }

      render(<Header user={guestUser} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument()
    })
  })

  describe('profile tooltip', () => {
    it('has View profile tooltip on avatar area', () => {
      const mockUser = {
        login: 'alice',
        name: 'Alice',
        avatarUrl: 'https://avatars.githubusercontent.com/u/1',
        role: 'user',
      }

      render(<Header user={mockUser} onNavigate={mockOnNavigate} onLogout={mockOnLogout} />)

      // The container div has the title attribute
      const profileArea = screen.getByTitle('View profile')
      expect(profileArea).toBeInTheDocument()
    })
  })
})
