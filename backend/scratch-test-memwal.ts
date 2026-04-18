import 'dotenv/config';
import { createMemWalClient } from './src/ai/memory/memwal.client';

async function test() {
  console.log('Testing MemWal connection...');
  console.log('Key:', process.env.MEMWAL_KEY?.slice(0, 10) + '...');
  console.log('Account ID:', process.env.MEMWAL_ACCOUNT_ID);
  console.log('Server URL:', process.env.MEMWAL_SERVER_URL);

  const client = await createMemWalClient();
  if (!client) {
    console.error('Failed to create client. Check ENV.');
    return;
  }

  try {
    const health = await client.health();
    console.log('Health check success:', health);

    const remember = await client.remember('Test memory from scratch script', 'test-namespace');
    console.log('Remember success:', remember);

    const recall = await client.recall('Test memory', 1, 'test-namespace');
    console.log('Recall success:', recall);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error during MemWal test:', message);
    if (error instanceof Error && error.stack) {
        console.error(error.stack);
    }
  }
}

test();
