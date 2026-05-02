# New Tools Added: Batch Transfer & NFT Transfer

This document describes the two new transaction tools added to the memoraSui project.

## Overview

Two new tools have been added to enable advanced transaction capabilities on the Sui blockchain:

1. **Batch Transfer Tool** - Send SUI tokens to multiple recipients in a single transaction using PTB (Programmable Transaction Block)
2. **NFT Transfer Tool** - Transfer NFTs/Objects to recipients

## 1. Batch Transfer Tool

### Purpose
Allows users to send SUI tokens to multiple wallet addresses in one transaction, reducing gas costs and improving efficiency.

### How to Use
Users can request batch transfers in natural language:

**Examples:**
- "chuyển 1 SUI cho 0xabc... và 2 SUI cho 0xdef..."
- "send 0.5 SUI to 0x123..., 0x456..., 0x789..."
- "gửi 1.5 SUI đến nhiều địa chỉ: 0xaaa..., 0xbbb..."

### Implementation Details

**Backend:**
- `backend/src/ai/tools/batch-transfer.tool.ts` - Parsing logic for batch transfers
- Supports two patterns:
  1. Different amounts: "1 SUI to 0xabc, 2 SUI to 0xdef"
  2. Same amount to multiple addresses: "1 SUI to 0xabc, 0xdef, 0xghi"
- Uses PTB (Programmable Transaction Block) to efficiently batch transfers

**Frontend:**
- Updated `frontend/src/app/chat/page.tsx` to handle batch transaction signing
- Shows summary UI with:
  - Total amount
  - Number of recipients
  - List of all transfers
  - Network information

**Transaction Flow:**
1. User inputs batch transfer request
2. AI detects `batch_transfer` intent
3. Backend parses recipients and amounts
4. Frontend displays confirmation dialog
5. PTB is constructed: splits gas coin into multiple coins and transfers each
6. User signs and executes transaction

## 2. NFT Transfer Tool

### Purpose
Enables users to transfer NFTs or objects to other wallet addresses.

### How to Use
Users can request NFT transfers in natural language:

**Examples:**
- "transfer NFT 0xobject123... to 0xrecipient456..."
- "chuyển object 0xabc... cho 0xdef..."
- "send NFT 0x111... đến 0x222..."

### Implementation Details

**Backend:**
- `backend/src/ai/tools/transfer-nft.tool.ts` - Parsing logic for NFT transfers
- Extracts:
  - Object ID (NFT/Object to transfer)
  - Recipient address
  - Optional: Object type
- Validates that object ID and recipient are different

**Frontend:**
- Updated `frontend/src/app/chat/page.tsx` to handle NFT transaction signing
- Shows confirmation UI with:
  - Object ID
  - Recipient address
  - Object type (if available)
  - Network information

**Transaction Flow:**
1. User inputs NFT transfer request
2. AI detects `transfer_nft` intent
3. Backend parses object ID and recipient
4. Frontend displays confirmation dialog
5. PTB is constructed: transfers the object
6. User signs and executes transaction

## Technical Implementation

### New Intent Types
Added to `classify-question.chain.ts`:
- `batch_transfer` - for multi-recipient transfers
- `transfer_nft` - for NFT/object transfers

### Detection Priority
The system checks in this order:
1. NFT transfer (most specific)
2. Batch transfer (multiple addresses detected)
3. Regular transfer (single recipient)

### Files Modified

**Backend:**
- `backend/src/ai/tools/batch-transfer.tool.ts` (NEW)
- `backend/src/ai/tools/transfer-nft.tool.ts` (NEW)
- `backend/src/ai/chains/classify-question.chain.ts` (UPDATED)
- `backend/src/ai/orchestrator/ai-harness.types.ts` (UPDATED)
- `backend/src/ai/orchestrator/chat-orchestrator.service.ts` (UPDATED)
- `backend/src/ai/orchestrator/tool-registry.ts` (UPDATED)
- `backend/src/app.module.ts` (UPDATED)

**Frontend:**
- `frontend/src/app/chat/page.tsx` (UPDATED)

### Type Definitions

```typescript
// Batch Transfer
type BatchTransferRecipient = {
  address: string;
  amountMist: string;
  amount: number;
};

type BatchTransferRequest = {
  recipients: BatchTransferRecipient[];
  network: string;
  totalAmount: number;
  totalAmountMist: string;
};

// NFT Transfer
type NFTTransferRequest = {
  objectId: string;
  recipient: string;
  network: string;
  objectType?: string;
};
```

## Benefits

### Batch Transfer
- **Efficiency**: Multiple transfers in one transaction
- **Cost Savings**: Reduced gas fees compared to individual transactions
- **Convenience**: No need to send multiple separate transactions
- **PTB Power**: Leverages Sui's Programmable Transaction Blocks

### NFT Transfer
- **Simplicity**: Easy NFT transfers through chat interface
- **Safety**: Validates object ID and recipient before execution
- **Type Awareness**: Can display object type information

## Future Enhancements

Potential improvements:
1. Support for custom token transfers (not just SUI)
2. Batch NFT transfers
3. Scheduled/recurring transfers
4. CSV import for bulk transfers
5. Transfer templates/presets

## Testing

To test the new features:

1. **Batch Transfer:**
   ```
   chuyển 0.1 SUI cho 0x7a4c..., 0.2 SUI cho 0x8b5d..., 0.3 SUI cho 0x9c6e...
   ```

2. **NFT Transfer:**
   ```
   transfer NFT 0x1234abcd... to 0x5678efgh...
   ```

Make sure you have:
- Sufficient SUI balance for batch transfers
- The NFT/object in your wallet for NFT transfers
- Connected wallet with proper permissions
