
========================================

# 📘 SOFTWARE REQUIREMENTS SPECIFICATION (SRS)

========================================

## 1. SYSTEM ARCHITECTURE (UPDATED)

### High-Level Architecture

```text
Frontend (Next.js)
   ↓
Backend API (NestJS)
   ├── Wallet Module
   ├── Blockchain Module
   ├── Sync Worker (Queue)
   ├── Analytics Module
   └── AI Harness Module
           ├── Router (Intent Detection)
           ├── Tool Layer (LangChain)
           ├── Prompt Layer
           └── Response Composer
   ↓
OpenAI API
```

---

## 2. LLM HARNESS ARCHITECTURE

```text
User Question
   ↓
LLM Router (Intent Detection)
   ↓
Tool Selection
   ├── getPortfolio()
   ├── getGasUsage()
   ├── getActivity()
   ├── getProtocolUsage()
   ↓
Structured JSON Output
   ↓
LLM Response Composer
   ↓
Final Answer
```

---

## 3. FUNCTIONAL REQUIREMENTS

### 3.1 Wallet Module

* Connect wallet
* Store address
* Trigger sync

### 3.2 Blockchain Module

* Fetch transactions
* Fetch balances
* Fetch transfers

### 3.3 Sync Module

* Queue-based sync
* Retry failed jobs

### 3.4 Normalization Module

* Convert raw tx → structured events

### 3.5 Analytics Module

* Gas summary
* Portfolio summary
* Activity summary

### 3.6 AI Harness Module

* Detect intent
* Select tool
* Fetch structured data
* Generate response

---

## 4. NON-FUNCTIONAL REQUIREMENTS

### Performance

* Sync < 10s (recent data)
* AI response < 3s

### Scalability

* Queue workers scalable
* Stateless API

### Security

* No private keys
* SIWE authentication

### Reliability

* Retry jobs
* Idempotent sync

---

## 5. ARCHITECTURE DIAGRAM (DETAILED)

```text
Frontend
   ↓
API Gateway
   ↓
-----------------------------
| Backend Services          |
|---------------------------|
| Wallet Service            |
| Blockchain Service        |
| Sync Worker (BullMQ)      |
| Analytics Service         |
| AI Harness Service        |
-----------------------------
   ↓
Database (PostgreSQL)
   ↓
OpenAI API
```

---

## 6. DATA FLOW

1. User connects wallet
2. Wallet saved in DB
3. Sync job created
4. Worker fetches blockchain data
5. Data normalized → DB
6. Analytics computed
7. User sends question
8. LLM selects tool
9. Tool returns structured data
10. LLM generates response

---

## 7. ERD (UPDATED)

```text
User
 ├── Wallet
 │    ├── RawTransaction
 │    │      └── NormalizedEvent
 │    ├── TokenBalance
 │    ├── ProtocolPosition
 │    ├── WalletSnapshot
 │    └── InsightSummary
 └── ChatSession
      └── ChatMessage
```

---

## 8. CORE TABLES

### Wallet

* id
* user_id
* address
* chain

### RawTransaction

* tx_hash
* from
* to
* value
* gas

### NormalizedEvent

* action_type
* protocol
* token_in
* token_out

### TokenBalance

* token
* balance
* value_usd

### ChatSession

* wallet_id

### ChatMessage

* role
* content

---

## 9. AI TOOL DESIGN (LANGCHAIN STYLE)

### Tools

```text
getPortfolio(walletId)
getGasUsage(walletId, period)
getActivity(walletId, period)
getProtocolUsage(walletId)
```

### Tool Output Example

```json
{
  "total_gas": 42.5,
  "tx_count": 18
}
```

---

## 10. API DESIGN

### Wallet

* POST /wallets
* POST /wallets/:id/sync

### Data

* GET /wallets/:id/events
* GET /wallets/:id/balances

### AI

* POST /chat

---

## 11. TECH STACK (UPDATED)

### Frontend

* Next.js
* wagmi
* viem
* SuiWallet

### Backend

* NestJS
* MongoDB
* Prisma mongo
* Redis
* BullMQ

### Blockchain

* Alchemy
* Moralis

### AI

* OpenAI API
* LangChain (tool orchestration)

---

## 12. CONSTRAINTS

* Blockchain data latency
* API limits
* LLM token limits

---

# 🚀 END DOCUMENT
