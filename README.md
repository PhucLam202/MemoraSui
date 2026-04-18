# AI-Powered Web3 Portfolio Assistant - Sui Project Context

This README is a compact context file for humans and LLMs.
It summarizes the product, architecture, implementation direction, and the rules that prevent the AI from hallucinating or leaking sensitive data.

## 1. Project Summary

The product is a conversational AI assistant for blockchain wallets.
Users connect a Sui wallet, sync on-chain data, and ask questions like:

- What did I do this week?
- How much gas did I spend?
- What tokens or objects do I hold?
- Which protocols do I use most?

The system turns raw on-chain data into structured analytics and natural-language answers.

## 2. Product Goal

Core goal:

- Convert complex wallet activity into readable insights
- Let users chat with their wallet
- Keep analytics explainable and grounded in backend data
- Reduce manual inspection of blockchain explorers

## 3. Product Philosophy

The architecture is hybrid:

- Backend is the source of truth for data and analytics
- LLM acts as orchestrator and explainer
- LangChain-style harness routes questions to structured tools

Important rule:

- The LLM must not parse blockchain data directly
- The LLM must call backend tools
- The backend decides what data is valid, safe, and complete

## 4. Current Implementation Direction

The original PRD/SRS describe an EVM-first version.
The current project direction is Sui-first.

So for implementation:

- Use Sui wallet connection flow
- Use Sui RPC / fullnode / indexer as data sources
- Work with transaction blocks, objects, coins, and events
- Use MongoDB with connection string based management
- Use Redis cache for repeated RPC calls
- Use OpenAI through a modular AI harness

If a detail in PRD/SRS conflicts with the current Todo, follow the Todo for implementation.

## 5. Target Users

- DeFi traders
- Long-term crypto investors
- NFT users
- Web3 beginners

## 6. MVP Scope

Must have:

- Wallet connection
- Wallet authentication
- On-chain data ingestion
- Transaction normalization
- Analytics modules
- AI harness with tool-based routing
- Dashboard UI

Nice to have later:

- Risk detection
- Tax analysis
- Multi-wallet support
- Multi-chain support

## 7. System Architecture

```text
Frontend (Next.js)
   ↓
Backend API (NestJS)
   ├── Wallet Module
   ├── Sui Data Module
   ├── Sync Worker / Queue
   ├── Normalization Module
   ├── Analytics Module
   └── AI Harness Module
           ├── Router / Intent Detection
           ├── Chains
           ├── Tools
           ├── Prompts
           ├── Agents
           └── Parsers
   ↓
MongoDB
   ↓
Redis Cache
   ↓
OpenAI API
```

## 8. Data Flow

1. User connects a Sui wallet
2. Backend stores wallet metadata
3. Sync job is created
4. Worker fetches on-chain data from Sui RPC / indexer
5. Raw data is normalized into domain events and summaries
6. Analytics snapshots are stored
7. User sends a question
8. LLM router detects intent
9. LLM calls the right tool
10. LLM composes the final answer from structured context

## 9. Backend Responsibilities

The backend owns:

- Wallet records
- Auth challenge and signature verification
- Sync jobs and retries
- Sui data ingestion
- Normalized events
- Analytics computation
- Chat session and message history
- Tool responses for the AI harness

The backend must be the only trusted source for:

- balances
- transaction history
- object ownership
- protocol usage
- gas summaries
- risk flags

## 10. MongoDB Model Direction

MongoDB is used as the main database.

Use:

- connection string via `MONGODB_URI`
- collections/models instead of SQL tables
- schema validation and indexed fields
- versioned documents where needed

Collections are expected for:

- Wallet
- SyncJob
- RawTransactionBlock
- NormalizedEvent
- CoinBalance
- ObjectPosition
- WalletSnapshot
- ChatSession
- ChatMessage

## 11. Sui Data Concepts

Important Sui concepts used by the product:

- Transaction Block
- Coin
- Object
- Event
- Gas fee
- Object ownership
- Move call output

The system should avoid EVM-specific assumptions unless they truly map to Sui behavior.

## 12. RPC and Cache Policy

Sui RPC calls must be cached whenever possible.

Rules:

- Cache repeated reads in Redis or an equivalent cache layer
- Use cache keys that include wallet, chain, cursor, and time window
- Apply different TTLs by data type
- Deduplicate concurrent requests
- Support stale-while-revalidate for low-churn data
- Do not call RPC repeatedly for the same data if cache is valid

Cacheable examples:

- wallet balances
- transaction summaries
- object snapshots
- event summaries

Do not cache unsafe or raw sensitive payloads unless they are sanitized first.

## 13. AI Harness Structure

The AI layer should be modular and explicit.

Suggested structure:

```text
backend/src/ai/
  chains/
    classify-question.chain.ts
    answer-wallet-summary.chain.ts
    answer-gas.chain.ts

  tools/
    get-wallet-summary.tool.ts
    get-gas-usage.tool.ts
    get-portfolio.tool.ts
    get-activity.tool.ts
    get-risk-flags.tool.ts

  prompts/
    system.prompt.ts
    gas.prompt.ts
    portfolio.prompt.ts

  agents/
    wallet-agent.ts

  parsers/
    structured-output.parser.ts
```

Responsibilities:

- Chains decide which task to run
- Tools fetch structured backend data
- Prompts define answer rules and safety rules
- Agents coordinate multi-step reasoning
- Parsers enforce structured output

## 14. AI Answering Rules

The AI must:

- Answer only from tool output and approved backend context
- Prefer short, exact, and explainable responses
- Ask for clarification when the question is ambiguous
- Refuse to invent values, counts, or ownership
- Avoid guessing protocol names or token identities
- Avoid assuming unsupported wallet activity

If the backend does not provide enough data:

- say the data is missing
- explain what is missing
- suggest the next sync or query step

## 15. Security and Privacy Guardrails

This project handles sensitive wallet data.

Hard rules:

- Never store private keys
- Never ask for private keys
- Never log secrets, signatures, tokens, or raw sensitive payloads in full
- Mask wallet addresses when full exposure is unnecessary
- Separate public and private data access
- Use short-lived challenge nonces for auth
- Prevent replay on signature-based login
- Minimize data sent to the LLM
- Do not expose unnecessary raw on-chain payloads to prompts

If a value is not required for the answer, do not pass it into the model.

## 16. Reliability Rules

The system should be:

- idempotent on sync and normalization
- retry-safe on worker jobs
- resilient to RPC timeouts and rate limits
- observable through logs and metrics

Prefer:

- safe retries
- deduplication
- clear job status
- deterministic output format

## 17. Non-Functional Targets

From the SRS intent:

- Recent sync should be fast
- AI response should be low latency
- API should remain stateless where possible
- Queue workers should scale independently
- Data processing should be repeatable

## 18. Key Product Metrics

Track:

- wallet connections
- chat usage per user
- AI answer accuracy
- 7-day retention
- sync success rate
- RPC cache hit rate

## 19. Out of Scope for MVP

Do not overbuild the first version with:

- multi-chain expansion
- tax engine
- complex risk scoring
- private key management
- direct blockchain parsing inside the LLM

## 20. LLM Working Contract

When using this repository as context, the LLM should:

- treat backend data as source of truth
- never infer missing on-chain facts
- prefer tools over assumptions
- follow security rules before answering
- ask for clarification if the intent is unclear
- keep the answer grounded, concise, and auditable

