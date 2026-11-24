import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import VerifyEmailBanner from './VerifyEmailBanner';
import { useAuthStore } from '@/store/auth.store';

describe('VerifyEmailBanner', () => {
  beforeEach(() => useAuthStore.getState().logout());

  it('shows for unconfirmed users only', () => {
    useAuthStore.getState().login({ id: '1', email: 'me@x.com', name: 'Me', role: 'USER', emailVerified: false }, 't');
    const { unmount } = render(<VerifyEmailBanner />);
    expect(screen.getByText('me@x.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resend link/i })).toBeInTheDocument();
    unmount();

    useAuthStore.getState().setUser({ id: '1', email: 'me@x.com', name: 'Me', role: 'USER', emailVerified: true });
    render(<VerifyEmailBanner />);
    expect(screen.queryByText('me@x.com')).not.toBeInTheDocument();
  });
});
