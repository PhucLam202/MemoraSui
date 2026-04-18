import { z } from 'zod';

export const walletAddressSchema = z
  .string()
  .min(8, 'Wallet address is too short')
  .max(128, 'Wallet address is too long');

export const walletRecordSchema = z.object({
  address: walletAddressSchema,
  network: z.enum(['devnet', 'testnet', 'mainnet']),
  label: z.string().min(1).max(80).optional(),
});

export type WalletRecordInput = z.infer<typeof walletRecordSchema>;
