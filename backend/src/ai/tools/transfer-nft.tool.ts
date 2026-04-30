import { Injectable, Logger } from '@nestjs/common';

export type NFTTransferRequest = {
  objectId: string;
  recipient: string;
  network: string;
  objectType?: string;
};

function parseObjectId(text: string): string | null {
  // Match object ID pattern (starts with 0x followed by hex)
  const match = text.match(/(?:object[:\s]+)?(0x[0-9a-fA-F]{40,64})/i);
  return match ? match[1] : null;
}

function parseRecipient(text: string): string | null {
  // Find all addresses and return the last one (likely the recipient)
  const addresses = text.match(/0x[0-9a-fA-F]{40,64}/g);
  if (!addresses || addresses.length === 0) return null;

  // If we have "object" or "nft" keyword, the address after it is the object ID
  // and we want the other address as recipient
  const hasObjectKeyword = /(?:object|nft)[:\s]+0x/i.test(text);
  if (hasObjectKeyword && addresses.length >= 2) {
    // Return the address that's NOT preceded by "object" or "nft"
    for (const addr of addresses) {
      const regex = new RegExp(`(?:object|nft)[:\\s]+${addr}`, 'i');
      if (!regex.test(text)) {
        return addr;
      }
    }
  }

  // Otherwise return the last address found
  return addresses[addresses.length - 1];
}

function parseObjectType(text: string): string | null {
  // Try to extract object type if mentioned
  const typeMatch = text.match(/type[:\s]+([A-Za-z0-9_:<>]+)/i);
  return typeMatch ? typeMatch[1] : null;
}

@Injectable()
export class TransferNFTTool {
  private readonly logger = new Logger(TransferNFTTool.name);

  parseNFTTransfer(question: string, network: string): NFTTransferRequest | null {
    const objectId = parseObjectId(question);
    const recipient = parseRecipient(question);
    const objectType = parseObjectType(question);

    if (!objectId || !recipient) {
      this.logger.warn(`Could not parse NFT transfer params from: "${question}"`);
      return null;
    }

    // Ensure objectId and recipient are different
    if (objectId === recipient) {
      this.logger.warn(`ObjectId and recipient are the same: "${objectId}"`);
      return null;
    }

    return {
      objectId,
      recipient,
      network,
      objectType: objectType || undefined,
    };
  }
}
