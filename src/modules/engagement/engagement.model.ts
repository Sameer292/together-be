import { uuid } from '@shared/models/request.model';
import { t } from 'elysia';

export const commentBody = t.Object({ body: t.String({ minLength: 1, maxLength: 2000 }) });
export const emoji = t.Union([t.Literal('like'), t.Literal('heart'), t.Literal('clap')]);
export const reactionBody = t.Object({ emoji });
export const reactionParams = t.Object({ submissionId: uuid, emoji });

export type CommentBody = typeof commentBody.static;
export type ReactionBody = typeof reactionBody.static;
