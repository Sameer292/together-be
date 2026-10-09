import { createHash, randomBytes, randomInt } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Database, Transaction } from '../db';
import { localAuthAccounts, localAuthCodes, localAuthSessions, profiles } from '../db/schema';
import { fail } from '../errors';
import type { Actor } from './service';

const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
const randomToken = (): string => randomBytes(32).toString('base64url');
const normalizedEmail = (email: string): string => email.trim().toLowerCase();
const invalid = (): never => fail(401, 'unauthorized', 'Authentication failed');
type Tokens = { accessToken: string; refreshToken: string; expiresIn: number };

export const createLocalAuthService = (db: Database) => {
  const issue = async (tx: Transaction, accountId: string): Promise<Tokens> => {
    const accessToken = randomToken();
    const refreshToken = randomToken();
    await tx.insert(localAuthSessions).values({
      accountId,
      accessHash: digest(accessToken),
      refreshHash: digest(refreshToken),
      accessExpiresAt: new Date(Date.now() + 3600_000),
      refreshExpiresAt: new Date(Date.now() + 30 * 86400_000),
    });
    return { accessToken, refreshToken, expiresIn: 3600 };
  };
  const makeCode = async (tx: Transaction, accountId: string, kind: 'email' | 'recovery'): Promise<string> => {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await tx.delete(localAuthCodes).where(and(eq(localAuthCodes.accountId, accountId), eq(localAuthCodes.kind, kind)));
    await tx.insert(localAuthCodes).values({
      accountId,
      kind,
      codeHash: await Bun.password.hash(code),
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    return code;
  };
  const accountForEmail = async (email: string) =>
    db.query.localAuthAccounts.findFirst({
      where: eq(localAuthAccounts.email, normalizedEmail(email)),
    });
  const consumeCode = async (
    tx: Transaction,
    accountId: string,
    kind: 'email' | 'recovery',
    code: string,
  ): Promise<void> => {
    const [row] = await tx
      .select()
      .from(localAuthCodes)
      .where(
        and(eq(localAuthCodes.accountId, accountId), eq(localAuthCodes.kind, kind), isNull(localAuthCodes.consumedAt)),
      )
      .orderBy(desc(localAuthCodes.createdAt))
      .limit(1)
      .for('update');
    if (!row) return invalid();
    if (row.expiresAt.getTime() <= Date.now() || !(await Bun.password.verify(code, row.codeHash))) return invalid();
    await tx.update(localAuthCodes).set({ consumedAt: sql`clock_timestamp()` }).where(eq(localAuthCodes.id, row.id));
  };
  return {
    register: async (email: string, password: string): Promise<{ message: string; devCode: string }> => {
      const id = crypto.randomUUID();
      const passwordHash = await Bun.password.hash(password);
      return db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: localAuthAccounts.id })
          .from(localAuthAccounts)
          .where(eq(localAuthAccounts.email, normalizedEmail(email)));
        if (existing) return fail(409, 'conflict', 'Account already exists');
        await tx.insert(profiles).values({ id, displayName: normalizedEmail(email).split('@')[0] ?? 'Member' });
        await tx.insert(localAuthAccounts).values({ id, email: normalizedEmail(email), passwordHash });
        const devCode = await makeCode(tx, id, 'email');
        return { message: 'Enter the local verification code', devCode };
      });
    },
    resend: async (email: string): Promise<{ message: string; devCode?: string }> => {
      const account = await accountForEmail(email);
      if (!account || account.verifiedAt) return { message: 'ok' };
      const devCode = await db.transaction((tx) => makeCode(tx, account.id, 'email'));
      return { message: 'Enter the local verification code', devCode };
    },
    requestReset: async (email: string): Promise<{ message: string; devCode?: string }> => {
      const account = await accountForEmail(email);
      if (!account?.verifiedAt) return { message: 'ok' };
      const devCode = await db.transaction((tx) => makeCode(tx, account.id, 'recovery'));
      return { message: 'Enter the local reset code', devCode };
    },
    verify: async (email: string, code: string, kind: 'email' | 'recovery'): Promise<Tokens> => {
      if (kind !== 'email') return fail(400, 'bad_request', 'Use password reset confirmation');
      return db.transaction(async (tx) => {
        const [account] = await tx
          .select()
          .from(localAuthAccounts)
          .where(eq(localAuthAccounts.email, normalizedEmail(email)))
          .for('update');
        if (!account) return invalid();
        await consumeCode(tx, account.id, 'email', code);
        await tx
          .update(localAuthAccounts)
          .set({ verifiedAt: sql`clock_timestamp()` })
          .where(eq(localAuthAccounts.id, account.id));
        return issue(tx, account.id);
      });
    },
    login: async (email: string, password: string): Promise<Tokens> => {
      const account = await accountForEmail(email);
      if (!account?.verifiedAt || !(await Bun.password.verify(password, account.passwordHash))) return invalid();
      const [profile] = await db
        .select({ deletionRequestedAt: profiles.deletionRequestedAt })
        .from(profiles)
        .where(eq(profiles.id, account.id));
      if (profile?.deletionRequestedAt) return fail(403, 'forbidden', 'Account deletion pending');
      return db.transaction((tx) => issue(tx, account.id));
    },
    refresh: async (refreshToken: string): Promise<Tokens> =>
      db.transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(localAuthSessions)
          .where(
            and(
              eq(localAuthSessions.refreshHash, digest(refreshToken)),
              isNull(localAuthSessions.revokedAt),
              gt(localAuthSessions.refreshExpiresAt, sql`clock_timestamp()`),
            ),
          )
          .for('update');
        if (!session) return invalid();
        const [account] = await tx
          .select({ verifiedAt: localAuthAccounts.verifiedAt, deletionRequestedAt: profiles.deletionRequestedAt })
          .from(localAuthAccounts)
          .innerJoin(profiles, eq(profiles.id, localAuthAccounts.id))
          .where(eq(localAuthAccounts.id, session.accountId));
        if (!account?.verifiedAt || account.deletionRequestedAt) return invalid();
        await tx
          .update(localAuthSessions)
          .set({ revokedAt: sql`clock_timestamp()` })
          .where(eq(localAuthSessions.id, session.id));
        return issue(tx, session.accountId);
      }),
    logout: async (accessToken: string): Promise<void> => {
      await db
        .update(localAuthSessions)
        .set({ revokedAt: sql`clock_timestamp()` })
        .where(eq(localAuthSessions.accessHash, digest(accessToken)));
    },
    userFromToken: async (accessToken: string): Promise<Actor> => {
      const [row] = await db
        .select({
          id: localAuthAccounts.id,
          email: localAuthAccounts.email,
          verifiedAt: localAuthAccounts.verifiedAt,
          moderationRole: profiles.moderationRole,
          deletionRequestedAt: profiles.deletionRequestedAt,
        })
        .from(localAuthSessions)
        .innerJoin(localAuthAccounts, eq(localAuthAccounts.id, localAuthSessions.accountId))
        .innerJoin(profiles, eq(profiles.id, localAuthAccounts.id))
        .where(
          and(
            eq(localAuthSessions.accessHash, digest(accessToken)),
            isNull(localAuthSessions.revokedAt),
            gt(localAuthSessions.accessExpiresAt, sql`clock_timestamp()`),
          ),
        );
      if (!row?.verifiedAt || row.deletionRequestedAt) return invalid();
      return { id: row.id, email: row.email, verified: true, moderationRole: row.moderationRole };
    },
    resetPassword: async (email: string, code: string, password: string): Promise<void> => {
      const passwordHash = await Bun.password.hash(password);
      await db.transaction(async (tx) => {
        const [account] = await tx
          .select()
          .from(localAuthAccounts)
          .where(eq(localAuthAccounts.email, normalizedEmail(email)))
          .for('update');
        if (!account?.verifiedAt) return invalid();
        await consumeCode(tx, account.id, 'recovery', code);
        await tx.update(localAuthAccounts).set({ passwordHash }).where(eq(localAuthAccounts.id, account.id));
        await tx
          .update(localAuthSessions)
          .set({ revokedAt: sql`clock_timestamp()` })
          .where(eq(localAuthSessions.accountId, account.id));
      });
    },
    deleteAccount: async (userId: string): Promise<void> => {
      await db.delete(localAuthAccounts).where(eq(localAuthAccounts.id, userId));
    },
  };
};
