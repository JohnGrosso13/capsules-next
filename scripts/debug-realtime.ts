import { createFriendRealtimeAuth } from '../src/services/realtime/friends';

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error('Usage: tsx scripts/debug-realtime.ts <user-id>');
    process.exit(1);
  }
  try {
    const payload = await createFriendRealtimeAuth(userId);
    console.log(JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error('Failed to create auth payload', error);
    process.exit(1);
  }
}

void main();
