export type FriendTargetInput = {
  userId?: string | null;
  key?: string | null;
  id?: string | null;
  name?: string | null;
  avatar?: string | null;
};

export function buildFriendTargetPayload(target: FriendTargetInput): Record<string, string> | null {
  const payload: Record<string, string> = {};
  if (target.userId) payload.userId = String(target.userId);
  else if (target.key) payload.userKey = String(target.key);
  else if (target.id) payload.id = String(target.id);
  else return null;

  if (target.name) payload.name = String(target.name);
  if (target.avatar) payload.avatar = String(target.avatar);

  return payload;
}
