import { uuid } from '@shared/models/request.model';
import { t } from 'elysia';

export const proofInput = t.Object({
  text: t.Optional(t.String({ minLength: 1, maxLength: 5000 })),
  link: t.Optional(t.String({ minLength: 1, maxLength: 2048 })),
  attachmentIds: t.Array(uuid, { maxItems: 20 }),
});

export type ProofBody = typeof proofInput.static;
