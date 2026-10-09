import { t } from 'elysia';

export const emailBody = t.Object({ email: t.String({ format: 'email' }) });
export const registerBody = t.Object({
  email: t.String({ format: 'email', maxLength: 320 }),
  password: t.String({ minLength: 12, maxLength: 128 }),
});
export const verifyBody = t.Object({
  email: t.String({ format: 'email' }),
  code: t.String({ minLength: 6, maxLength: 16 }),
});
export const loginBody = t.Object({ email: t.String({ format: 'email' }), password: t.String() });
export const refreshBody = t.Object({ refreshToken: t.String({ minLength: 16 }) });
export const resetPasswordBody = t.Object({
  email: t.String({ format: 'email' }),
  code: t.String({ minLength: 6, maxLength: 16 }),
  password: t.String({ minLength: 12, maxLength: 128 }),
});
export const callbackQuery = t.Object({ flow: t.Optional(t.Union([t.Literal('email'), t.Literal('recovery')])) });
export const callbackBody = t.Object({
  flow: t.Union([t.Literal('email'), t.Literal('recovery')]),
  email: t.String({ format: 'email' }),
  code: t.String({ minLength: 6, maxLength: 16 }),
  password: t.Optional(t.String({ minLength: 12, maxLength: 128 })),
});

export type RegisterBody = typeof registerBody.static;
export type VerifyBody = typeof verifyBody.static;
export type LoginBody = typeof loginBody.static;
export type RefreshBody = typeof refreshBody.static;
export type ResetPasswordBody = typeof resetPasswordBody.static;
export type CallbackBody = typeof callbackBody.static;
