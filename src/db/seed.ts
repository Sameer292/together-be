import { createDatabase } from './index';
import { challenges, groups, memberships, profiles } from './schema';

const url = process.env.MIGRATION_DATABASE_URL;
if (
  !url ||
  process.env.NODE_ENV === 'production' ||
  !/^postgres(?:ql)?:\/\/[^/]+@(?:127\.0\.0\.1|localhost):\d+\/[^?]*_dev(?:\?|$)/.test(url)
)
  throw new Error('Seed requires a local *_dev database and non-production mode');
const database = createDatabase(url);
const id = crypto.randomUUID();
await database.db.transaction(async (tx) => {
  await tx.insert(profiles).values({ id, displayName: 'Synthetic Demo Member' });
  const [group] = await tx
    .insert(groups)
    .values({ name: 'Synthetic Demo Group', description: 'Local fixture only', ownerId: id })
    .returning({ id: groups.id });
  if (!group) throw new Error('Group insert failed');
  await tx.insert(memberships).values({ groupId: group.id, userId: id, generation: 1 });
  await tx.insert(challenges).values({
    groupId: group.id,
    creatorId: id,
    title: 'Ship a small project',
    description: 'Build something useful',
    criteria: 'Share what you built',
    proofFormats: ['text', 'link'],
    deadlineAt: new Date(Date.now() + 86400000),
  });
});
console.info(JSON.stringify({ event: 'synthetic_seed_created', userId: id }));
await database.close();
