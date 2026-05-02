import { z } from 'zod';

const executionPreviewAllocationSchema = z.object({
  symbol: z.string().min(1),
  currentPct: z.number().finite().optional(),
  targetPct: z.number().finite(),
});

const executionRequestSchema = z.object({
  kind: z.enum(['swap', 'rebalance', 'deepbook_order']),
  network: z.literal('mainnet'),
  transactionKindBytesBase64: z.string().min(10),
  transactionJson: z.string().min(10),
  quoteExpiresAt: z.string().datetime(),
  summary: z.object({
    title: z.string().min(1),
    detail: z.string().min(1),
  }),
  preview: z.object({
    actionLabel: z.string().min(1),
    fromToken: z.string().optional(),
    toToken: z.string().optional(),
    amountIn: z.string().optional(),
    expectedAmountOut: z.string().optional(),
    market: z.string().optional(),
    side: z.enum(['buy', 'sell']).optional(),
    orderType: z.enum(['limit', 'market']).optional(),
    price: z.string().optional(),
    quantity: z.string().optional(),
    slippagePct: z.number().finite(),
    route: z.array(z.string()).optional(),
    protocols: z.array(z.string()).optional(),
    allocations: z.array(executionPreviewAllocationSchema).optional(),
  }),
  risk: z.object({
    warnings: z.array(z.string()),
    touchedProtocols: z.array(z.string()),
    gasEstimateMist: z.string().optional(),
    expectedBalanceChanges: z
      .array(
        z.object({
          symbol: z.string(),
          amount: z.string(),
        }),
      )
      .optional(),
    requiresElevatedConfirmation: z.boolean().optional(),
    elevatedReason: z.string().optional(),
    rejectCode: z.string().optional(),
    securityChecks: z
      .object({
        slippagePct: z.number().finite().optional(),
        priceImpactPct: z.number().finite().optional(),
        complexityScore: z.number().finite().optional(),
        gasReserve: z
          .object({
            availableMist: z.string().optional(),
            requiredMist: z.string(),
            keepGasMist: z.string().optional(),
            minGasBufferMist: z.string(),
          })
          .optional(),
      })
      .optional(),
  }),
});

export type ExecutionRequest = z.infer<typeof executionRequestSchema>;

export function parseExecutionRequestPayload(payload: unknown) {
  const parsed = executionRequestSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false as const,
      error: issue ? `${issue.path.join('.')} ${issue.message}`.trim() : 'unknown schema error',
    };
  }
  return {
    ok: true as const,
    value: parsed.data,
  };
}
