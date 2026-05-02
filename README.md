# Sui Portfolio Assistant

An AI-powered Web3 portfolio assistant for the Sui ecosystem.

The project combines wallet authentication, blockchain data sync, and an agentic AI layer so users can ask natural-language questions about their holdings, activity, fees, and on-chain context.

## Overview

Instead of manually inspecting raw transactions, the app turns wallet data into a conversational experience:

- Ask what changed in your portfolio over time.
- Understand gas and fee spikes.
- Look up protocol or market context for a wallet action.
- Continue long-running conversations with long-term memory support.

## Key Features

- Sui wallet-first authentication and session handling.
- AI agent orchestration for portfolio, gas, and research tasks.
- Long-term memory integration via MemWal.
- Normalized blockchain event processing for grounded responses.
- Real-time sync pipeline backed by queue workers.
- Monorepo structure with separate frontend, backend, worker, and shared packages.

## Architecture

The backend is the source of truth for wallet auth, sync, analytics, and AI tool responses.

### Services

- `frontend`: Next.js app for the user interface.
- `backend`: NestJS API for auth, wallet sync, AI orchestration, and domain logic.
- `worker`: BullMQ-based background worker for queue processing.
- `shared`: Common TypeScript types and utilities shared across packages.

### AI Flow

1. A user sends a wallet-related question.
2. The backend authenticates the request and loads the relevant wallet context.
3. The supervisor agent routes the task to specialized sub-agents.
4. The system grounds the response against normalized on-chain data before returning it.

## Tech Stack

- Next.js 15
- React 19
- NestJS 11
- TypeScript
- Sui SDK
- LangGraph / LangChain
- BullMQ
- MongoDB / Mongoose
- Redis / ioredis
- MemWal

## Repository Structure

```txt
frontend/   Next.js app
backend/    NestJS API
worker/     Queue worker
shared/     Shared types and helpers
```

## Prerequisites

- Node.js 20+
- pnpm 10+
- MongoDB
- Redis
- A Sui wallet and network access to Sui RPC / indexer services

## Environment Setup

Each package provides an example environment file:

- `backend/.env.example`
- `frontend/.env.example`
- `worker/.env.example`

Copy the relevant example files and fill in the required values for your local setup.

### Important Backend Variables

- `SUI_NETWORK`
- `SUI_RPC_URL`
- `MONGODB_URI`
- `REDIS_URL`
- `AUTH_TOKEN_SECRET`
- `MEMWAL_ENABLED`
- `MEMWAL_KEY`

## Getting Started

Install dependencies:

```bash
pnpm install
```

Run the frontend and backend:

```bash
pnpm dev
```

Run frontend, backend, and worker together:

```bash
pnpm dev:all
```

Build all main packages:

```bash
pnpm build
```

Type-check the workspace:

```bash
pnpm typecheck
```

## Package Scripts

- `pnpm dev` - run frontend and backend in parallel.
- `pnpm dev:all` - run frontend, backend, and worker in parallel.
- `pnpm build` - build shared, backend, and frontend.
- `pnpm lint` - lint shared, backend, and frontend.
- `pnpm typecheck` - run TypeScript checks across all packages.

## Security Notes

- Never commit real wallet secrets, private keys, or production tokens.
- Keep `AUTH_TOKEN_SECRET` unique per environment.
- Treat blockchain data as untrusted input and validate everything before use.

## License

This project is intended to be released under the MIT License.

See the `LICENSE` file for the full text.
