import { t } from 'elysia';

export const errorDto = t.Object({ error: t.Object({ code: t.String(), message: t.String(), requestId: t.String() }) });
export const groupDto = t.Object({
  id: t.String({ format: 'uuid' }),
  name: t.String(),
  description: t.String(),
  ownerId: t.String({ format: 'uuid' }),
  archivedAt: t.Union([t.String({ format: 'date-time' }), t.Null()]),
});
export const challengeDto = t.Object({
  id: t.String({ format: 'uuid' }),
  groupId: t.String({ format: 'uuid' }),
  title: t.String(),
  description: t.String(),
  criteria: t.String(),
  proofFormats: t.Array(t.String()),
  deadlineAt: t.String({ format: 'date-time' }),
  publishedAt: t.Union([t.String({ format: 'date-time' }), t.Null()]),
  cancelledAt: t.Union([t.String({ format: 'date-time' }), t.Null()]),
});
export const attachmentDto = t.Object({ id: t.String({ format: 'uuid' }), mimeType: t.String() });
export const submissionDto = t.Object({
  id: t.String({ format: 'uuid' }),
  userId: t.String({ format: 'uuid' }),
  text: t.Union([t.String(), t.Null()]),
  link: t.Union([t.String(), t.Null()]),
  acceptedAt: t.String({ format: 'date-time' }),
  attachments: t.Array(attachmentDto),
});
export type ErrorDto = typeof errorDto.static;
export type GroupDto = typeof groupDto.static;
export type ChallengeDto = typeof challengeDto.static;
export type AttachmentDto = typeof attachmentDto.static;
export type SubmissionDto = typeof submissionDto.static;
export type PageDto<T> = { items: T[]; nextCursor: string | null };
export const tokenResultDto = t.Object({
  data: t.Object({ accessToken: t.String(), refreshToken: t.String(), expiresIn: t.Number() }),
});
export const idResultDto = t.Object({ data: t.Object({ id: t.String({ format: 'uuid' }) }) });
export const groupCreatedResultDto = t.Object({
  data: t.Object({ id: t.String({ format: 'uuid' }), name: t.String(), description: t.String() }),
});
export const acceptedResultDto = t.Object({
  data: t.Object({ id: t.String({ format: 'uuid' }), accepted: t.Boolean() }),
});
export type TokenResultDto = typeof tokenResultDto.static;
export type IdResultDto = typeof idResultDto.static;
export type GroupCreatedResultDto = typeof groupCreatedResultDto.static;
export type AcceptedResultDto = typeof acceptedResultDto.static;
export const groupResultDto = t.Object({ data: groupDto });
export const groupPageResultDto = t.Object({
  data: t.Object({ items: t.Array(groupDto), nextCursor: t.Union([t.String({ format: 'uuid' }), t.Null()]) }),
});
export const feedResultDto = t.Object({
  data: t.Object({ items: t.Array(submissionDto), nextCursor: t.Union([t.String({ format: 'uuid' }), t.Null()]) }),
});
export type GroupResultDto = typeof groupResultDto.static;
export type GroupPageResultDto = typeof groupPageResultDto.static;
export type FeedResultDto = typeof feedResultDto.static;
