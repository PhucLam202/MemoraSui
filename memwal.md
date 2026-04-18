# MemWal SDK Developer Guide (VN)

## 1. MemWal là gì?

MemWal là một lớp memory bền vững, có mã hóa, dành cho ứng dụng AI/agent. Thay vì tự xây vector DB + encryption + retrieval, bạn dùng SDK để:

* lưu memory (`remember`)
* truy xuất memory liên quan (`recall`)
* phân tích text để rút facts (`analyze`)
* kiểm tra trạng thái dịch vụ (`health`)
* khôi phục index nếu cần (`restore`)

Tư duy đúng:

* MemWal không thay backend analytics
* MemWal không thay blockchain ingestion
* MemWal phù hợp nhất cho memory layer trong AI harness

### Thông tin package thực tế

Theo package đang cài trong backend hiện tại:

* package: `@mysten-incubation/memwal`
* version: `0.0.1`
* package type: ESM (`"type": "module"`)
* main entry: `./dist/index.js`
* typings: `./dist/index.d.ts`
* docs: `https://docs.memwal.ai`
* docs index cho LLM: `https://docs.memwal.ai/llms.txt`

---

## 2. Khi nào nên dùng MemWal trong dự án này?

Trong dự án Web3 AI Portfolio Assistant, MemWal nên dùng cho:

* nhớ các insight đã tạo ra trước đó
* nhớ user preference trong chat
* lưu các summary hữu ích giữa nhiều session
* recall context cũ trước khi model trả lời
* hỗ trợ conversational continuity giữa nhiều phiên chat

Không nên dùng MemWal cho:

* tính portfolio từ blockchain raw data
* tính gas/fee summary từ transaction gốc
* thay thế database nghiệp vụ
* thay thế ingestion pipeline
* thay source of truth analytics

---

## 3. 3 entry points của SDK

### 3.1 `MemWal`

Import:

```ts
import { MemWal } from "@mysten-incubation/memwal";
```

Dùng khi:

* muốn dùng đường mặc định
* relayer xử lý embeddings + SEAL + storage
* phù hợp với đa số app backend/web app
* muốn triển khai nhanh cho hackathon

### 3.2 `MemWalManual`

Import:

```ts
import { MemWalManual } from "@mysten-incubation/memwal/manual";
```

Dùng khi:

* muốn tự quản embeddings
* muốn local SEAL operations
* đã có vector hoặc blob encrypted riêng
* cần kiểm soát sâu hơn luồng xử lý

### 3.3 `withMemWal`

Import:

```ts
import { withMemWal } from "@mysten-incubation/memwal/ai";
```

Dùng khi:

* đang dùng Vercel AI SDK
* muốn memory như middleware cho model
* muốn auto-recall/auto-save theo flow generation

Khuyến nghị cho backend hackathon hiện tại:

* dùng `MemWal`
* chỉ dùng `withMemWal` nếu app chat đã thật sự đi theo Vercel AI SDK
* chưa cần `MemWalManual` nếu mục tiêu là shipping nhanh

---

## 4. Cài đặt

### MemWal cơ bản

```bash
npm install @mysten-incubation/memwal
```

Hoặc với `pnpm`:

```bash
pnpm add @mysten-incubation/memwal
```

### Nếu dùng `MemWalManual`

```bash
npm install @mysten/sui @mysten/seal @mysten/walrus
```

### Nếu dùng `withMemWal`

```bash
npm install ai zod
```

### Peer dependencies thực tế

SDK khai báo các peer dependencies sau:

* `ai >= 4.0.0`
* `zod ^3.23.0`
* `@mysten/sui >= 2.5.0`
* `@mysten/seal >= 1.1.0`
* `@mysten/walrus >= 1.0.3`

Lưu ý:

* default `MemWal` client không bắt buộc dùng hết toàn bộ peer deps ngay
* `MemWalManual` mới là mode cần thêm nhiều dependency hơn
* với backend memory wrapper cơ bản, `@mysten-incubation/memwal` là điểm bắt đầu phù hợp

---

## 5. Chuẩn bị config

Bạn cần:

* `key`: delegate private key Ed25519 dạng hex
* `accountId`: MemWal account object ID trên Sui
* `serverUrl`: URL của relayer
* `namespace`: vùng nhớ logic cho app

Ví dụ:

```ts
import { MemWal } from "@mysten-incubation/memwal";

export const memwal = MemWal.create({
  key: process.env.MEMWAL_KEY!,
  accountId: process.env.MEMWAL_ACCOUNT_ID!,
  serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memwal.ai",
  namespace: process.env.MEMWAL_NAMESPACE || "wallet-chat",
});
```

### Mapping env vars nên dùng trong backend

```env
MEMWAL_KEY=your_delegate_private_key_hex
MEMWAL_ACCOUNT_ID=0x...
MEMWAL_SERVER_URL=https://relayer.memwal.ai
MEMWAL_NAMESPACE=wallet-chat
```

Giải thích:

* `MEMWAL_KEY`: delegate private key Ed25519 dạng hex
* `MEMWAL_ACCOUNT_ID`: object ID của `MemWalAccount`
* `MEMWAL_SERVER_URL`: URL relayer hosted hoặc self-hosted
* `MEMWAL_NAMESPACE`: namespace mặc định nếu không truyền per-call

### Nguồn tạo account/key

Có thể tạo account ID và delegate key qua MemWal hosted flow hoặc MemWal account onboarding flow. Nếu tự host relayer thì cần thêm bước tạo account và setup delegate key.

### Relayer URLs thường dùng

* Mainnet: `https://relayer.memwal.ai`
* Staging/Testnet: `https://relayer.staging.memwal.ai`

---

## 6. Namespace là gì?

`namespace` là vùng nhớ logic để tách memory theo owner + use case.

Ví dụ tốt:

* `wallet-chat`
* `wallet-insights`
* `project-x`
* `user-123-wallet-a`

Không nên:

* để tất cả trong `default`

Trong app này có thể dùng:

* `wallet-chat:<walletId>`
* `wallet-insights:<walletId>`
* `env:prod:wallet-chat:<walletId>`
* `env:prod:wallet-insights:<walletId>`

Nguyên tắc:

* namespace phải đủ tách biệt để tránh recall sai context
* không nên reuse cùng namespace cho nhiều loại dữ liệu khác nhau nếu semantics khác nhau

---

## 7. Các method chính

### 7.1 `health()`

Dùng để kiểm tra cấu hình và kết nối hoạt động.

```ts
await memwal.health();
```

Response shape:

```ts
type HealthResult = {
  status: string;
  version: string;
};
```

### 7.2 `remember(text)`

Lưu một memory mới.

```ts
await memwal.remember("User prefers short explanations and tracks SUI + USDC.");
```

Signature thực tế:

```ts
remember(text: string, namespace?: string): Promise<RememberResult>
```

Response shape:

```ts
type RememberResult = {
  id: string;
  blob_id: string;
  owner: string;
  namespace: string;
};
```

Nên lưu:

* insight hữu ích
* preference người dùng
* summary sau mỗi phiên chat
* long-term fact đã được lọc

Không nên lưu:

* raw transaction payload lớn
* secret/key/token
* dữ liệu nhạy cảm không cần thiết
* tool metadata thô chưa được lọc

### 7.3 `recall(query, limit?)`

Tìm các memory liên quan theo ngữ nghĩa.

```ts
const result = await memwal.recall("What do we already know about this wallet?", 5);
console.log(result.results);
```

Signature thực tế:

```ts
recall(query: string, limit?: number, namespace?: string): Promise<RecallResult>
```

Response shape:

```ts
type RecallMemory = {
  blob_id: string;
  text: string;
  distance: number;
};

type RecallResult = {
  results: RecallMemory[];
  total: number;
};
```

Dùng khi:

* trước mỗi lần model trả lời
* cần lấy context từ phiên trước
* muốn personalize answer theo history

### 7.4 `analyze(text)`

Trích facts từ text để lưu memory tốt hơn.

```ts
const analysis = await memwal.analyze(
  "This wallet mainly swaps SUI to USDC weekly and avoids NFT trading."
);
console.log(analysis.facts);
```

Signature thực tế:

```ts
analyze(text: string, namespace?: string): Promise<AnalyzeResult>
```

Response shape:

```ts
type AnalyzedFact = {
  text: string;
  id: string;
  blob_id: string;
};

type AnalyzeResult = {
  facts: AnalyzedFact[];
  total: number;
  owner: string;
};
```

Dùng khi:

* sau khi có summary dài
* sau khi user nói nhiều thông tin trong một phiên
* muốn extract facts trước khi lưu vào memory

### 7.5 `restore(namespace, limit?)`

Khôi phục hoặc rebuild memory index từ storage khi cần.

```ts
await memwal.restore("wallet-chat", 100);
```

Signature thực tế:

```ts
restore(namespace: string, limit?: number): Promise<RestoreResult>
```

Response shape:

```ts
type RestoreResult = {
  restored: number;
  skipped: number;
  total: number;
  namespace: string;
  owner: string;
};
```

Chỉ nên dùng khi:

* cần repair index
* migrate hoặc rebuild
* PostgreSQL vector state bị thiếu nhưng blob trên Walrus vẫn còn

---

## 8. MemWal hoạt động phía sau như thế nào?

Khi gọi `remember(text)`:

1. SDK ký request bằng delegate key
2. relayer verify delegate access
3. relayer tạo embedding cho text
4. plaintext được mã hóa bằng SEAL
5. blob mã hóa được upload lên Walrus
6. vector embedding được index trong PostgreSQL

Khi gọi `recall(query)`:

1. query được embed
2. relayer tìm vector gần nhất trong namespace tương ứng
3. tải blob từ Walrus
4. giải mã
5. trả về plaintext phù hợp

Điều này có nghĩa:

* app của bạn không phải tự build vector DB
* app của bạn không phải tự build encrypted storage flow
* app của bạn chỉ cần quản đúng config, namespace, và hygiene của memory

### Auth/request model của SDK

Default client dùng signed request với các header như:

* `x-public-key`
* `x-signature`
* `x-timestamp`
* `x-delegate-key`
* `x-account-id`

Điểm quan trọng:

* owner không cần gửi thủ công trong body
* relayer dùng public key và account mapping để xác định owner
* `accountId` là một phần binding quan trọng của request

---

## 9. Vai trò đúng của MemWal trong dự án Web3 AI

### Dùng cho memory

* prior wallet summaries
* prior explanations
* user preferences
* important historical insights
* conversational continuity giữa nhiều session

### Không dùng cho source of truth

Source of truth vẫn là backend của bạn:

* MongoDB/Postgres cho transaction/object/balance
* analytics service cho gas/activity/protocol
* ingestion service cho raw on-chain sync

Flow chuẩn:

```text
User question
  -> backend tools lấy dữ liệu thật
  -> MemWal recall lấy memory liên quan
  -> LLM ghép tool output + memory
  -> trả lời
  -> MemWal remember lưu insight mới
```

---

## 10. Cách tích hợp vào AI harness

### Bước 1: Router xác định intent

Ví dụ:

* portfolio question
* fee question
* activity question
* NFT/object question
* protocol usage question

### Bước 2: Gọi backend tool phù hợp

Ví dụ:

* `getPortfolio(walletId)`
* `getFeeSummary(walletId, period)`
* `getActivitySummary(walletId, period)`
* `getProtocolUsage(walletId, period)`
* `getObjectSummary(walletId)`

### Bước 3: Recall memory từ MemWal

Ví dụ:

```ts
const memories = await memwal.recall(question, 5, `wallet-chat:${walletId}`);
```

### Bước 4: Gửi tool output + memory cho model

### Bước 5: Sau khi trả lời, remember insight hữu ích

Ví dụ:

```ts
await memwal.remember(
  "Wallet mostly interacts with Cetus and Bluefin; user asks for short weekly summaries.",
  `wallet-insights:${walletId}`,
);
```

---

## 11. Ví dụ service wrapper trong backend

```ts
import { MemWal } from "@mysten-incubation/memwal";

export class MemWalService {
  private client = MemWal.create({
    key: process.env.MEMWAL_KEY!,
    accountId: process.env.MEMWAL_ACCOUNT_ID!,
    serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memwal.ai",
    namespace: process.env.MEMWAL_NAMESPACE || "wallet-chat",
  });

  async health() {
    return this.client.health();
  }

  async remember(text: string, namespace?: string) {
    return this.client.remember(text, namespace);
  }

  async recall(query: string, limit = 5, namespace?: string) {
    return this.client.recall(query, limit, namespace);
  }

  async analyze(text: string, namespace?: string) {
    return this.client.analyze(text, namespace);
  }

  async restore(namespace: string, limit = 100) {
    return this.client.restore(namespace, limit);
  }
}
```

---

## 12. Ví dụ flow trả lời chat

```ts
const intent = await classifyQuestion(question);
const toolData = await runToolByIntent(intent, walletId, question);
const memories = await memwalService.recall(question, 5, `wallet-chat:${walletId}`);

const answer = await llm.generate({
  question,
  toolData,
  memories: memories.results,
});

await memwalService.remember(
  `Useful wallet insight: ${answer.summary ?? answer.text}`,
  `wallet-insights:${walletId}`,
);
```

---

## 13. Nếu dùng Vercel AI SDK

Có thể dùng `withMemWal` như middleware cho model.

Pattern tổng quát:

```ts
const model = withMemWal(baseModel, {
  key,
  accountId,
  serverUrl,
  maxMemories: 5,
  autoSave: true,
});
```

Phù hợp khi:

* app chat dùng Vercel AI SDK sẵn
* muốn tự động recall trước generation
* muốn auto-save sau mỗi turn

Lưu ý:

* đây là integration path riêng
* không bắt buộc nếu backend của bạn đang orchestration theo service/controller truyền thống

---

## 14. Best practices cho dự án này

### Nên làm

* dùng namespace rõ ràng
* gọi `health()` khi app khởi động
* recall trước khi generate answer
* chỉ remember các fact có giá trị lâu dài
* tách source-of-truth data và memory layer
* lưu chat history nội bộ riêng để audit/debug

### Không nên làm

* không lưu raw blockchain payload lớn vào MemWal
* không đưa private key/secret vào memory
* không dùng MemWal thay database nghiệp vụ
* không để tất cả memory trong cùng namespace `default`
* không lưu thẳng tool output chưa lọc nếu chứa dữ liệu dư thừa

---

## 15. Low-level methods và mode nâng cao

Ngoài các method phổ biến, SDK còn có:

* `embed(text)`
* `rememberManual({ blobId, vector, namespace? })`
* `recallManual({ vector, limit?, namespace? })`

Shape thực tế:

```ts
type EmbedResult = {
  vector: number[];
};

type RememberManualOptions = {
  blobId: string;
  vector: number[];
  namespace?: string;
};

type RecallManualOptions = {
  vector: number[];
  limit?: number;
  namespace?: string;
};
```

Khi nào cần:

* bạn đã có vector riêng
* bạn đã upload encrypted blob riêng
* bạn muốn control pipeline sâu hơn

Khuyến nghị cho dự án hiện tại:

* chưa cần manual mode ở phase hackathon này
* default `MemWal` client vẫn là lựa chọn đúng hơn

---

## 16. Account/manual/AI exports của package

Package export các entry sau:

* `@mysten-incubation/memwal`
* `@mysten-incubation/memwal/account`
* `@mysten-incubation/memwal/manual`
* `@mysten-incubation/memwal/ai`

Ý nghĩa:

* default entry: client mặc định `MemWal`
* `account`: account management trên chain
* `manual`: full client-side flow với SEAL/Walrus/embedding tự quản
* `ai`: wrapper cho Vercel AI SDK

Trong type definitions, account layer có thêm các khái niệm:

* `createAccount`
* `addDelegateKey`
* `removeDelegateKey`
* `WalletSigner`

Điều này hữu ích nếu sau này bạn muốn tự động hóa onboarding MemWal account ngay trong app.

---

## 17. Khuyến nghị thực tế cho backend hiện tại

Pattern an toàn cho NestJS backend:

1. app start gọi `memwal.health()`
2. user hỏi
3. backend analytics/tools lấy dữ liệu thật
4. gọi `memwal.recall(question, 3-5, namespace)`
5. ghép `toolData + recalled memories` vào prompt
6. generate answer
7. optional: `memwal.analyze(longText)` nếu text dài
8. `memwal.remember(usefulFact, namespace)` cho long-term facts
9. vẫn lưu chat log local DB để audit/debug

Namespace gợi ý:

* `env:dev:wallet-chat:<walletId>`
* `env:prod:wallet-chat:<walletId>`
* `env:prod:wallet-insights:<walletId>`

---

## 18. Appendix: SDK reference ngắn

### Quick Start chuẩn theo package README

```ts
import { MemWal } from "@mysten-incubation/memwal";

const memwal = MemWal.create({
  key: "your-delegate-key-hex",
  accountId: "your-memwal-account-id",
  serverUrl: "https://your-relayer-url.com",
  namespace: "demo",
});

await memwal.remember("User prefers dark mode and uses TypeScript.");
const memories = await memwal.recall("What are the user's preferences?");
await memwal.restore("demo");
```

### How it works

1. SDK ký request bằng delegate key
2. relayer verify delegate access
3. `remember` sẽ embed, encrypt, upload Walrus, rồi index vector
4. `recall` tìm theo namespace và trả về plaintext đã giải mã

### Lower-level methods

* `rememberManual({ blobId, vector, namespace? })`
* `recallManual({ vector, limit?, namespace? })`
* `embed(text)`
