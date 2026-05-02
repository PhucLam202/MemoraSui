# 🚀 Web3 AI Portfolio Assistant - Sui Todo Breakdown

> Ghi chú quan trọng: Todo này đã được chuyển từ tư duy EVM sang Sui-first.
> Các phần như `wagmi`, `viem`, `RainbowKit`, `Alchemy`, `Uniswap`, `SIWE` không còn là trọng tâm.
> Thay vào đó sẽ dùng Sui wallet adapter, Sui RPC/fullnode/indexer, dữ liệu `transaction block`, `object`, `coin`, `event`, và cơ chế xác thực bằng chữ ký ví.

========================================
PHASE 0: PRODUCT SCOPE VÀ TECH DECISION
========================================

[x] Chốt phạm vi MVP cho Sui
    - MVP chỉ hỗ trợ 1 chain theo môi trường triển khai, cấu hình qua `SUI_NETWORK` (`devnet`/`testnet`/`mainnet`)
    - Mỗi user chỉ có 1 wallet chính trong giai đoạn MVP
    - Ưu tiên `portfolio`, `activity`, `fee analytics`, `object/NFT summary`, `AI chat`

[x] Chốt kiến trúc hệ thống theo PRD/SRS
    - Frontend: `Next.js`
    - Backend: `NestJS`
    - Queue worker: `BullMQ` hoặc worker tương đương
    - DB: `MongoDB`
    - Kết nối DB bằng connection string từ `MONGODB_URI`
    - AI: `OpenAI API` qua tool-based harness

[x] Chốt data source cho Sui
    - `Sui RPC / fullnode` là nguồn chính cho trạng thái hiện tại và truy vấn live
    - `Sui indexer` dùng cho backfill, lịch sử dài, và các truy vấn có cursor lớn
    - Source of truth cho dữ liệu nghiệp vụ là backend + MongoDB đã normalize, không để LLM tự đọc raw blockchain data

[x] Định nghĩa các khái niệm nghiệp vụ trên Sui
    - `Transaction Block`: đơn vị thực thi giao dịch gốc trên Sui, là mốc chính để sync
    - `Coin balance`: số dư theo coin type / coin object đã quy đổi theo ngữ cảnh nghiệp vụ
    - `Object ownership`: quan hệ sở hữu object, bao gồm trực tiếp, wrapped, shared theo dữ liệu on-chain
    - `Event emitted từ Move call`: payload sự kiện được dùng để suy ra hành vi nghiệp vụ
    - `Gas fee / total fee`: chi phí thực thi và tổng phí giao dịch theo block
    - `Protocol/app usage`: phân loại mức sử dụng app/protocol từ transaction block, package, và event

========================================
PHASE 1: PROJECT SETUP VÀ BASELINE
========================================

[x] Tạo monorepo structure
    - Đã tạo `frontend/` cho `Next.js`
    - Đã tạo `backend/` cho `NestJS`
    - Đã tạo `worker/` cho queue worker tách riêng
    - Đã tạo `shared/` cho types, constants, validation schema

[x] Thiết lập environment chuẩn
    - Đã thêm `.env.example` cho `frontend/`, `backend/`, `worker/`
    - Đã cấu hình root `TypeScript`, `Prettier`, `pnpm workspace`, và `ESLint` baseline
    - Tạm chưa thêm git hooks ở phase 1 để tránh tăng friction setup sớm
    - Đã ghi naming convention tại `docs/engineering-conventions.md`

[x] Thiết lập database nền
    - Chốt `MongoDB` local/dev hoặc Atlas qua `MONGODB_URI`
    - Chọn `Mongoose` làm ODM phù hợp với `NestJS`
    - Đã tạo schema `Wallet`, `SyncJob` với index và `schemaVersion`
    - Đã tạo seed script tối thiểu `backend/src/database/seeds/dev.seed.ts`

[x] Thiết lập Redis và queue layer
    - Đã scaffold `Redis` connection dạng optional theo env
    - Đã có queue health check qua `GET /api/health`
    - Đã chốt retry/backoff cơ bản trong `BullMQ`

[x] Thiết lập logging và error baseline
    - Đã có logger cho API và worker
    - Đã có error JSON format thống nhất qua global exception filter
    - Đã có `x-correlation-id` cho request/job baseline

========================================
PHASE 2: FRONTEND - WALLET CONNECTION TRÊN SUI
========================================

[x] Tích hợp Sui wallet connect
    - chọn SDK/wallet adapter phù hợp với Sui
    - hỗ trợ connect/disconnect
    - hiển thị trạng thái ví rõ ràng

[x] Xây UI state cho wallet
    - connected / connecting / disconnected / error
    - hiển thị address ngắn gọn
    - hiển thị network đang dùng

[x] Thiết kế luồng chọn chain/môi trường
    - devnet / testnet / mainnet
    - cảnh báo nếu ví và backend khác môi trường

[x] Chuẩn bị flow ký thông điệp xác thực
    - backend trả challenge
    - wallet ký message
    - frontend gửi signature về backend

[x] Lưu wallet session ở frontend
    - persist trạng thái đăng nhập
    - auto reconnect an toàn
    - handle logout/expired session

========================================
PHASE 3: AUTH VÀ USER MODEL
========================================

[x] Thiết kế user model
    - user id
    - wallet address
    - chain/environment
    - session metadata

[x] Thiết kế cơ chế auth bằng chữ ký ví
    - challenge nonce
    - verify signature
    - issue session token
    - expire/revoke session

[x] API auth cơ bản
    - create challenge
    - verify signature
    - refresh session nếu cần

[x] Ràng buộc user-wallet
    - 1 user có thể gắn 1 hoặc nhiều wallet ở giai đoạn sau
    - MVP ưu tiên 1 wallet chính
    - tránh tạo trùng wallet record

========================================
PHASE 4: SUI DATA INGESTION LAYER
========================================

[x] Tạo Sui client/service wrapper
    - RPC client
    - cấu hình timeout, retry, rate limit
    - abstraction để dễ đổi provider

[x] Tạo RPC cache layer
    - cache response cho các truy vấn lặp lại
    - dùng Redis hoặc cache service tương đương
    - TTL riêng cho từng loại dữ liệu: balance, object, tx history, event
    - key cache theo wallet address, chain, cursor, timestamp window
    - chống gọi RPC lặp lại khi cùng dữ liệu đã có trong cache
    - hỗ trợ stale-while-revalidate cho dữ liệu ít thay đổi
    - dedupe request đồng thời để tránh bắn nhiều call trùng
    - chỉ cache dữ liệu public hoặc dữ liệu đã được lọc an toàn

[x] Thiết kế chiến lược sync lịch sử
    - backfill theo mốc thời gian hoặc cursor
    - incremental sync cho dữ liệu mới
    - giới hạn phạm vi dữ liệu MVP

[x] Fetch transaction blocks
    - tx digest
    - sender / recipient liên quan
    - gas fee
    - timestamp
    - status / success / failure

[x] Fetch coin data
    - coin type
    - balance
    - change theo giao dịch
    - native SUI và token khác

[x] Fetch object data
    - object id
    - owner
    - type
    - version
    - wrapped / transferred / mutated state nếu cần

[x] Định nghĩa chiến lược pagination và cursor
    - tránh mất dữ liệu khi sync dài
    - xử lý resume job
    - không sync trùng

========================================
PHASE 5: WALLET STORAGE VÀ SYNC ENGINE
========================================

[x] Tạo collection/model Wallet
    - user_id
    - address
    - chain/environment
    - last_synced_at
    - sync_cursor
    - lưu dưới dạng MongoDB collection/model

[x] Tạo collection/model SyncJob
    - wallet_id
    - status
    - type
    - retry_count
    - started_at / finished_at
    - lưu dưới dạng MongoDB collection/model

[x] Tạo API trigger sync
    - POST sync theo wallet
    - validate quyền sở hữu ví
    - trả về trạng thái job

[x] Xây worker xử lý sync
    - lấy job từ queue
    - gọi Sui ingestion service
    - lưu raw data
    - cập nhật cursor và trạng thái

[x] Thêm retry và backoff
    - retry khi RPC timeout
    - retry khi rate limit
    - đánh dấu job failed nếu vượt ngưỡng

[x] Đảm bảo idempotency
    - tránh insert trùng transaction block
    - tránh nhân đôi event/balance/object snapshot
    - unique constraint theo digest/object id/cursor phù hợp

========================================
PHASE 6: DATA MODEL VÀ NORMALIZATION
========================================

[x] Thiết kế collection/model RawTransaction / RawTransactionBlock
    - digest
    - sender
    - timestamp

========================================
PHASE 7: AI ORCHESTRATION - LANGGRAPH.JS (NODE.JS)
========================================

[x] Chốt phạm vi LangGraph cho backend hiện tại
    - ưu tiên triển khai trong `backend/src/ai/` để tận dụng code AI đang có sẵn
    - giữ `ai/orchestrator` hiện tại chạy song song trong giai đoạn chuyển tiếp
    - mục tiêu MVP: supervisor + 2 sub-agents trước, sau đó mới mở rộng thêm `staking` và `tax`
    - không đổi sang Python, dùng LangGraph.js thuần với TypeScript

[x] Thiết kế lại luồng điều phối theo phong cách supervisor/sub-agents
    - supervisor nhận message user, tạo plan ngắn gọn, rồi quyết định agent nào cần gọi
    - sub-agents tách theo trách nhiệm: `portfolio`, `gas`, `staking`, `tax`
    - các sub-agents nên có thể chạy song song khi query cho phép
    - kết quả từ sub-agents cần được chuẩn hóa trước khi trả về frontend

[x] Tạo cấu trúc thư mục mới cho LangGraph
    - `backend/src/ai/config/` để chứa file config và loader
    - `backend/src/ai/graph/` để chứa `state.ts`, `supervisor.ts`, `workflow.ts`
    - `backend/src/ai/subagents/` để chứa agent chuyên môn
    - `backend/src/ai/tools/` để chứa custom tools gọi Sui / analytics / memory
    - `backend/src/ai/memory/` để nối Memwal hoặc provider memory khác
    - `backend/src/chat/` hoặc route hiện có để gọi graph từ API

[x] Thiết kế file config `agents.yaml`
    - khai báo version, supervisor model, temperature, system prompt
    - khai báo từng sub-agent với `enabled`, `model`, `description`, `tools`
    - khai báo memory provider và `auto_save`
    - khai báo `recursion_limit` và `parallel_subagents`
    - cho phép bật/tắt agent mà không cần sửa code

[x] Implement loader cho config LangGraph
    - parse YAML thành object TypeScript an toàn kiểu dữ liệu
    - validate trường bắt buộc trước khi khởi động app
    - expose config qua một module dùng chung cho graph và route
    - chuẩn hóa default nếu config thiếu một vài trường không bắt buộc

[x] Định nghĩa `AgentState` dùng chung
    - `messages` để giữ hội thoại
    - `userAddress` để neo theo ví
    - `walletData` để cache dữ liệu on-chain
    - `plan` để lưu kế hoạch supervisor
    - `subResults` để gom kết quả từ sub-agents
    - `next` hoặc routing field tương đương để điều hướng graph

[x] Tạo sub-agent mẫu cho `portfolio`
    - đọc dữ liệu holdings, allocation, PnL, performance
    - giới hạn toolset chỉ cho mục tiêu portfolio
    - trả về structured data + insight ngắn
    - chuẩn hóa output để supervisor merge được

[x] Tạo sub-agent mẫu cho `gas`
    - đọc gas fee hiện tại và lịch sử gas
    - phân tích thời điểm giao dịch phù hợp
    - chỉ dùng tool cần thiết, tránh để agent tự do truy cập dữ liệu thừa
    - output phải ngắn, có thể render trực tiếp trên UI

[ ] Thiết kế sub-agent `staking` và `tax` cho phase sau
    - `staking` dùng để theo dõi positions, rewards, APY, claim suggestion
    - `tax` dùng cho capital gain và staking income, có thể cần model mạnh hơn
    - tách riêng để không làm phức tạp MVP ban đầu
    - chỉ bật khi data pipeline và tool đủ ổn định

[x] Tạo tool registry cho LangGraph
    - wrap các hàm truy vấn Sui/indexer/analytics vào tool rõ ràng
    - chuẩn hóa input/output schema cho từng tool
    - map tool theo sub-agent thay vì cho agent gọi bừa
    - tận dụng lại `tool-registry` / orchestration hiện có nếu còn phù hợp

[x] Tích hợp Memwal hoặc memory layer
    - inject memory vào state hoặc middleware của graph
    - lưu tóm tắt hội thoại sau mỗi lần sub-agent trả kết quả
    - tránh lưu raw payload quá lớn vào prompt
    - định nghĩa rõ chỗ autosave và chỗ chỉ đọc

[x] Build workflow / graph chính
    - khởi tạo `StateGraph`
    - add node cho supervisor và từng sub-agent
    - cấu hình conditional edges theo plan của supervisor
    - compile graph thành module dùng được từ API
    - hỗ trợ stream response nếu frontend cần hiển thị dần

[x] Kết nối graph vào chat API
    - route chat gọi graph thay vì chỉ gọi loop tool cũ
    - nhận `message` và `userAddress` từ request
    - truyền config và state ban đầu vào graph
    - trả về JSON hoặc SSE tùy nhu cầu streaming

[x] Giữ tương thích với hệ thống AI hiện tại
    - không xóa ngay `ai/orchestrator`
    - xác định rõ vùng dùng LangGraph mới và vùng vẫn dùng tool loop cũ
    - lên kế hoạch migration từng bước để tránh break chat hiện có
    - sau khi ổn định mới dọn dẹp code cũ

[ ] Thêm quan sát và debug cho graph
    - bật trace qua LangSmith nếu có key
    - log route quyết định của supervisor ở mức vừa đủ
    - log kết quả tool/sub-agent theo correlation id
    - tránh log raw secrets, signature, session token, hay payload nhạy cảm

[x] Chốt package cần cài cho LangGraph.js
    - `@langchain/langgraph`
    - `@langchain/core`
    - `@langchain/groq` hoặc provider model tương ứng
    - `yaml`
    - types bổ sung nếu cần cho TypeScript

[x] Làm bản MVP nhỏ trước khi mở rộng
    - supervisor + `portfolio` + `gas`
    - sau đó thêm `staking`
    - cuối cùng thêm `tax`
    - ưu tiên end-to-end chat flow trước, tối ưu agent sau

[x] Thiết kế collection/model NormalizedEvent
    - action type
    - protocol/app
    - asset in / asset out
    - amount
    - wallet involvement
    - reference digest
    - lưu dưới dạng MongoDB collection/model

[x] Thiết kế collection/model CoinBalance
    - wallet_id
    - coin type
    - balance
    - value USD nếu có
    - snapshot time
    - lưu dưới dạng MongoDB collection/model

[x] Thiết kế collection/model ObjectPosition
    - wallet_id
    - object id
    - object type
    - owner type
    - latest version
    - state snapshot
    - lưu dưới dạng MongoDB collection/model

[x] Xây normalization service
    - map raw transaction block sang domain event
    - map event payload sang action type
    - chuẩn hóa token/object/protocol name

[x] Định nghĩa action type cho Sui
    - transfer
    - receive
    - swap
    - mint
    - burn
    - stake
    - unstake
    - nft_buy
    - nft_sell
    - contract_call
    - unknown

[x] Viết rule nhận diện cơ bản
    - transfer coin
    - object transfer
    - swap qua protocol phổ biến
    - approve tương đương không còn là trọng tâm như EVM, chỉ giữ nếu thực sự có domain tương ứng

========================================
PHASE 7: ANALYTICS CORE
========================================

[x] Portfolio summary
    - total wallet value
    - top assets
    - coin distribution
    - object/NFT summary

[x] Activity summary
    - tx count theo ngày/tuần/tháng
    - incoming vs outgoing
    - active days
    - protocol/app usage

[x] Fee analytics
    - total fee
    - fee theo khoảng thời gian
    - top expensive transactions
    - trung bình fee mỗi giao dịch

[x] Protocol usage analytics
    - dApp/protocol được dùng nhiều nhất
    - tần suất tương tác
    - action breakdown theo protocol

[x] Snapshot layer
    - tạo WalletSnapshot hoặc SummarySnapshot
    - lưu kết quả tính toán để chat đọc nhanh
    - refresh theo lịch hoặc theo sync job
    - lưu dưới dạng MongoDB collection/model

========================================
PHASE 8: BACKEND API LAYER
========================================

[x] API wallet
    - create wallet record
    - get wallet by address/id
    - list wallets của user

[x] API sync
    - trigger sync
    - check sync status
    - sync history/log

[x] API data
    - get transactions
    - get normalized events
    - get balances
    - get objects/NFTs
    - get snapshots/summary

[x] API analytics
    - get portfolio summary
    - get activity summary
    - get fee summary
    - get protocol usage

[x] API chat
    - create chat session
    - send message
    - load conversation history

[x] Chuẩn hóa response format
    - success/error envelope
    - pagination
    - filter theo date range
    - sort và search cơ bản

========================================
PHASE 9: AI HARNESS / CHAT LAYER (MEMWAL VERSION)
========================================

[x] Đặt vị trí module AI trong backend
```text
backend/src/ai/
  chains/
    classify-question.chain.ts
    answer-wallet-summary.chain.ts
    answer-fee.chain.ts
    answer-activity.chain.ts
    answer-object.chain.ts

  tools/
    get-wallet-summary.tool.ts
    get-fee-summary.tool.ts
    get-portfolio.tool.ts
    get-activity.tool.ts
    get-protocol-usage.tool.ts
    get-object-summary.tool.ts
    get-risk-flags.tool.ts

  memory/
    memwal.client.ts
    memwal.service.ts
    memwal.recall.ts
    memwal.remember.ts
    memwal.analyze.ts
    namespace.util.ts

  prompts/
    system.prompt.ts
    wallet-summary.prompt.ts
    fee.prompt.ts
    activity.prompt.ts
    object.prompt.ts

  agents/
    wallet-agent.ts

  parsers/
    structured-output.parser.ts
```

[x] Tạo chat session model
    - wallet_id
    - title
    - created_at
    - last_message_at
    - lưu dưới dạng MongoDB collection/model
    - mục đích: audit / UI session management

[x] Tạo chat message model
    - role
    - content
    - tool call metadata
    - timestamp
    - memory reference nếu có
    - lưu dưới dạng MongoDB collection/model
    - mục đích: replay / debug / audit

[x] Xây router nhận diện intent
    - portfolio question
    - fee question
    - activity question
    - object/NFT question
    - protocol usage question

[x] Tích hợp MemWal SDK
    - cài `@mysten-incubation/memwal`
    - cấu hình key, accountId, serverUrl, namespace
    - khởi tạo MemWal client
    - health check khi app start

[x] Thiết kế namespace cho memory
    - namespace theo môi trường: dev / staging / prod
    - namespace theo app domain: wallet-chat, wallet-insights
    - cân nhắc tách theo chain hoặc user segment nếu cần

[x] Tạo lớp MemWal client wrapper
    - create client từ config
    - expose methods:
      - remember(text)
      - recall(query, limit)
      - analyze(text)
      - health()
      - restore(namespace, batchSize) nếu cần repair index

[x] Tổ chức AI harness theo module rõ ràng
    - `ai/chains/classify-question.chain.ts`
    - `ai/chains/answer-wallet-summary.chain.ts`
    - `ai/chains/answer-fee.chain.ts`
    - `ai/chains/answer-activity.chain.ts`
    - `ai/chains/answer-object.chain.ts`
    - `ai/tools/get-wallet-summary.tool.ts`
    - `ai/tools/get-fee-summary.tool.ts`
    - `ai/tools/get-portfolio.tool.ts`
    - `ai/tools/get-activity.tool.ts`
    - `ai/tools/get-protocol-usage.tool.ts`
    - `ai/tools/get-object-summary.tool.ts`
    - `ai/tools/get-risk-flags.tool.ts`
    - `ai/memory/memwal.client.ts`
    - `ai/memory/memwal.service.ts`
    - `ai/memory/memwal.recall.ts`
    - `ai/memory/memwal.remember.ts`
    - `ai/memory/memwal.analyze.ts`
    - `ai/memory/namespace.util.ts`
    - `ai/prompts/system.prompt.ts`
    - `ai/prompts/wallet-summary.prompt.ts`
    - `ai/prompts/fee.prompt.ts`
    - `ai/prompts/activity.prompt.ts`
    - `ai/prompts/object.prompt.ts`
    - `ai/agents/wallet-agent.ts`
    - `ai/parsers/structured-output.parser.ts`

[x] Giữ tool layer theo backend source of truth
    - getPortfolio(walletId)
    - getFeeSummary(walletId, period)
    - getActivitySummary(walletId, period)
    - getProtocolUsage(walletId, period)
    - getObjectSummary(walletId)
    - getRiskFlags(walletId)

[x] Thêm memory recall step trước khi compose answer
    - gọi `memwal.recall()` theo question hiện tại
    - lấy related memories:
      - prior wallet insights
      - user preferences
      - prior explanations
    - merge memory vào prompt context có kiểm soát

[x] Thêm memory write step sau khi trả lời
    - lưu các insight hữu ích bằng `memwal.remember()`
    - chỉ lưu fact / summaries có giá trị lâu dài
    - không lưu raw payload hoặc dữ liệu nhạy cảm không cần thiết

[x] Dùng `memwal.analyze()` cho text dài khi cần
    - sau mỗi phiên chat dài
    - sau khi generate wallet summary
    - trích facts trước khi remember

[x] Chia rõ responsibility cho từng chain
    - classify-question chain chỉ làm phân loại ý định
    - answer-wallet-summary chain chỉ trả lời summary
    - answer-fee chain chỉ trả lời phí/gas
    - answer-activity chain chỉ trả lời activity
    - answer-object chain chỉ trả lời object/NFT
    - mỗi chain chỉ gọi tools liên quan + memory recall cần thiết

[x] Xây prompt layer
    - chỉ trả lời dựa trên tool output + recalled memory
    - không bịa số liệu
    - ưu tiên câu trả lời ngắn, rõ, có dẫn chứng từ context
    - prompt không chứa dữ liệu nhạy cảm không cần thiết
    - prompt phải ẩn address full nếu không bắt buộc
    - không đưa raw payload chưa lọc vào LLM nếu không thật sự cần

[x] Xây response composer
    - ghép tool output + recalled memory thành câu trả lời tự nhiên
    - fallback khi thiếu dữ liệu
    - handle câu hỏi mơ hồ bằng hỏi lại

[x] Lưu lịch sử chat
    - lưu question và answer
    - lưu tool call metadata
    - lưu memory write/read metadata
    - phục vụ audit/debug

[x] Thiết kế chiến lược restore
    - dùng `memwal.restore(namespace, batchSize)` khi index bị thiếu
    - chỉ dùng cho repair / rebuild memory index

[x] Chốt tư duy triển khai
    - backend tools vẫn là source of truth
    - MemWal là memory layer cho recall / remember / analyze
    - LLM harness kết hợp tool backend + memory từ MemWal để trả lời tốt hơn

========================================
PHASE 10: DASHBOARD UI
========================================

[x] Trang connect wallet
    - connect/disconnect
    - state auth
    - chọn môi trường Sui

[x] Trang overview
    - total value
    - top assets
    - last sync
    - recent activity

[x] Trang activity
    - danh sách transaction block
    - event tags
    - filter theo thời gian
    - trạng thái success/fail

[x] Trang assets / objects
    - coin balances
    - NFT/object summary
    - detail view cho object

[x] Trang analytics
    - fee chart
    - activity chart
    - protocol usage chart

[x] Trang chat
    - hộp chat
    - câu trả lời từ AI
    - hiển thị nguồn dữ liệu dùng để trả lời

[x] Xử lý UX cơ bản
    - loading / empty / error state
    - skeleton cho dashboard
    - responsive desktop/mobile

========================================
PHASE 11: RELIABILITY, SECURITY VÀ OBSERVABILITY
========================================

[ ] Logging chuẩn
    - [x] API logs
    - [x] worker logs
    - [x] sync logs
    - [x] AI tool-call logs
    - [x] mask address full, signature, token, object metadata nhạy cảm trong log
    - [x] không log raw payload đầy đủ nếu không có nhu cầu debug đặc biệt

[x] Monitoring cơ bản
    - [x] queue health
    - [x] job failure rate
    - [x] RPC error rate
    - [x] OpenAI latency

[x] Rate limit handling
    - [x] Sui RPC
    - [x] indexer nếu có
    - [x] OpenAI

[ ] Bảo vệ dữ liệu nhạy cảm
    - [x] không lưu private key dưới mọi hình thức
    - [x] chỉ lưu address và signature metadata cần thiết
    - [ ] encrypt dữ liệu nhạy cảm ở rest nếu có
    - [x] mask dữ liệu nhạy cảm trong log
    - [x] phân tách dữ liệu public và private theo collection
    - [x] chỉ expose dữ liệu đúng theo quyền của wallet owner
    - [x] dùng challenge nonce ngắn hạn cho auth ký ví
    - [x] giới hạn rate và chống replay cho endpoint xác thực
    - [x] không gửi thông tin thừa từ backend sang AI harness

[x] Kiểm soát chất lượng dữ liệu
    - [x] detect duplicate sync
    - [x] verify missing cursor
    - [x] reconcile balance vs transaction mismatch nếu có

[x] Tính idempotent cho mọi luồng ghi
    - [x] sync job
    - [x] normalization
    - [x] snapshot generation

========================================
PHASE 12: AI HARNESS VÀ LLM INTEGRATION
========================================

[ ] Kết nối LLM thành harness thực thụ
    - [ ] OpenAI client / wrapper riêng
    - [ ] route-tools chain thay cho regex / hardcoded flow
    - [ ] tool-call loop / orchestrator
    - [ ] compose-answer chain để LLM tổng hợp kết quả tool
    - [ ] state cho từng lượt chat: question, memories, tool plan, tool results, final answer

[ ] Chuẩn hóa tool registry
    - [ ] name / description / input schema / output shape / execute()
    - [ ] validate args trước khi chạy tool
    - [ ] audit tool call plan và result

[ ] Tận dụng các tool đang có
    - [ ] get-wallet-summary
    - [ ] get-risk-flags
    - [ ] get-protocol-usage
    - [ ] get-portfolio
    - [ ] các tool analytics khác nếu đã có sẵn

[ ] MemWal integration đúng vai trò
    - [ ] recall trước khi gọi tool
    - [ ] remember sau khi có final answer
    - [ ] không thay backend source of truth

[ ] Audit và debug cho AI flow
    - [ ] lưu user question
    - [ ] lưu tool plan / arguments / results
    - [ ] lưu final answer
    - [ ] lưu memory recalled / remembered
    - [ ] theo dõi lỗi tool call và lỗi compose

========================================
PHASE 13: TESTING VÀ RELEASE
========================================

[ ] Unit test cho module lõi
    - ingestion
    - normalization
    - analytics
    - chat router
    - cache layer
    - auth signature flow
    - data masking helpers

[ ] Integration test cho API
    - wallet create
    - sync trigger
    - data read endpoints
    - chat endpoint

[ ] Test cho worker
    - job success
    - job retry
    - job fail
    - idempotency

[ ] Test UI cơ bản
    - wallet connect
    - overview render
    - chat flow

[ ] Chuẩn bị staging release
    - env staging
    - sample wallets
    - seed data
    - smoke test

[ ] Ghi nhận acceptance criteria cho MVP
    - connect ví Sui thành công
    - sync được dữ liệu on-chain
    - xem được portfolio/activity/fee/object summary
    - hỏi chat và nhận câu trả lời dựa trên tool backend

========================================
PHASE 13: NICE TO HAVE SAU MVP
========================================

[ ] Multi-wallet per user

[ ] Multi-chain expansion ngoài Sui

[ ] Risk detection
    - ví có hành vi bất thường
    - cảnh báo giao dịch rủi ro

[ ] Tax export
    - export CSV
    - phân loại giao dịch phục vụ báo cáo

[ ] Smart insights nâng cao
    - xu hướng hoạt động theo thời gian
    - so sánh wallet với chính nó theo mốc
    - gợi ý hành động tiếp theo
