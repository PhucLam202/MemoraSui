========================================

# 📘 PRODUCT REQUIREMENTS DOCUMENT (PRD)

========================================

## 1. Product Overview

**Product Name:** AI-Powered Web3 Portfolio Assistant
**Goal:** Build a conversational AI system that understands blockchain wallet activity using a modular backend + LLM harness (LangChain-style) to deliver insights, summaries, and intelligent responses.

---

## 2. Product Philosophy (Updated)

The system follows a **hybrid architecture**:

* Backend = **source of truth (data + analytics)**
* LLM = **orchestrator + explainer**
* LangChain (or equivalent) = **tool routing layer**

👉 LLM does NOT parse blockchain directly
👉 LLM calls structured tools/modules

---

## 3. Target Users

* DeFi traders
* Long-term crypto investors
* NFT users
* Web3 beginners

---

## 4. Core Value Proposition

* Convert complex on-chain data → human-readable insights
* Allow users to "chat with their wallet"
* Provide contextual, explainable analytics
* Reduce need for Etherscan/manual analysis

---

## 5. Key Features

### 5.1 Wallet Connection

* MetaMask / WalletConnect
* EVM chains (Ethereum / Base first)

### 5.2 Portfolio Overview

* Token balances
* Total USD value
* Asset distribution

### 5.3 Activity Tracking

* Transaction history
* Categorized events:

  * swap
  * send / receive
  * approve
  * stake

### 5.4 AI Chat (Core Feature)

User queries:

* "What did I do this week?"
* "How much gas did I spend?"
* "What tokens am I holding?"

System behavior:

* LLM detects intent
* Calls appropriate backend module (tool)
* Returns structured answer

### 5.5 Insights

* Gas analytics
* Protocol usage
* Activity summaries

---

## 6. MVP Scope

### Must Have

* Wallet connection
* Blockchain data ingestion
* Transaction normalization
* Analytics modules
* AI harness (tool-based)

### Nice to Have

* Risk detection
* Tax analysis
* Multi-chain

---

## 7. Success Metrics

* Wallet connections
* Chat usage per user
* Accuracy of AI responses
* Retention (7-day)

---

## 8. Risks

* LLM hallucination
* Incorrect analytics
* API rate limits

---
