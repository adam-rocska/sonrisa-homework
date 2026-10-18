import { describe, expect, it } from 'vitest';
import { principalFromSession, type SessionIdentity } from '../src/identity.js';

const session: SessionIdentity = {
  session: { token: 'private-session', expiresAt: new Date('2030-01-01') },
  user: { id: 'user-1', email: 'Boss@example.com', name: 'Boss', emailVerified: true },
};
const now = new Date('2026-01-01');
describe('authentication boundary', () => {
  it('only grants admin to a verified allowlisted email', () => {
    expect(principalFromSession(session, new Set(['boss@example.com']), now)?.role).toBe('admin');
    expect(principalFromSession(session, new Set(), now)?.role).toBe('user');
    expect(
      principalFromSession(
        { ...session, user: { ...session.user, emailVerified: false } },
        new Set(['boss@example.com']),
        now,
      ),
    ).toBeNull();
  });
  it('rejects absent and expired sessions', () => {
    expect(principalFromSession(null, new Set(), now)).toBeNull();
    expect(principalFromSession(session, new Set(), new Date('2031-01-01'))).toBeNull();
  });
  it('never leaks the session token into a user DTO', () => {
    expect(principalFromSession(session, new Set(), now)).not.toHaveProperty('session');
    expect(principalFromSession(session, new Set(), now)).not.toHaveProperty('token');
  });
});
