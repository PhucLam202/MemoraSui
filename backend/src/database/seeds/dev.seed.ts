import 'dotenv/config';
import mongoose from 'mongoose';
import { backendEnv } from '../../config/env';
import { WalletSchema } from '../schemas/wallet.schema';

async function runSeed() {
  if (!backendEnv.mongodb.enabled) {
    console.error('MongoDB seed skipped. Set MONGODB_ENABLED=true first.');
    process.exit(1);
  }

  const connection = await mongoose.createConnection(backendEnv.mongodb.uri).asPromise();
  const Wallet = connection.model('Wallet', WalletSchema);

  await Wallet.updateOne(
    {
      address: '0xphase1demo',
      network: backendEnv.network,
    },
    {
      $set: {
        label: 'Phase 1 Demo Wallet',
      },
    },
    {
      upsert: true,
    },
  );

  console.log('Seed completed: Phase 1 demo wallet created or updated.');
  await connection.close();
}

runSeed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
