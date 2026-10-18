export interface SessionIdentity {
  readonly session: { readonly token: string; readonly expiresAt: Date };
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly emailVerified: boolean;
    readonly name: string;
  };
}

export interface Principal {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: 'user' | 'admin';
}

export interface AuthBoundary {
  readonly configured: boolean;
  handler(request: Request): Promise<Response>;
  getSession(headers: Headers): Promise<SessionIdentity | null>;
  close(): void;
}

export function principalFromSession(
  session: SessionIdentity | null,
  adminEmails: ReadonlySet<string>,
  now = new Date(),
): Principal | null {
  if (session === null || !session.user.emailVerified || session.session.expiresAt <= now)
    return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: adminEmails.has(session.user.email.toLowerCase()) ? 'admin' : 'user',
  };
}
