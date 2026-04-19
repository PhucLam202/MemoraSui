
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

async function main() {
  const address = '0x67fa46832853022ec905addb69dc7fb2640c2dd04e26bd96fcd4ffdb234b99ee';
  const client = new SuiClient({ url: getFullnodeUrl('testnet') });

  console.log(`Fetching balances for ${address} on testnet...`);
  const balances = await client.getAllBalances({ owner: address });
  
  console.log('Balances:', JSON.stringify(balances, null, 2));

  for (const balance of balances) {
    if (balance.coinType !== '0x2::sui::SUI') {
        try {
            const metadata = await client.getCoinMetadata({ coinType: balance.coinType });
            console.log(`Metadata for ${balance.coinType}:`, JSON.stringify(metadata, null, 2));
        } catch (e) {
            console.log(`Could not fetch metadata for ${balance.coinType}`);
        }
    } else {
        console.log(`SUI balance: ${balance.totalBalance}`);
    }
  }
}

main().catch(console.error);
