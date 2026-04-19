import { Module } from '@nestjs/common';
import { AnswerActivityChain } from './ai/chains/answer-activity.chain';
import { AnswerFeeChain } from './ai/chains/answer-fee.chain';
import { AnswerObjectChain } from './ai/chains/answer-object.chain';
import { AnswerPortfolioChain } from './ai/chains/answer-portfolio.chain';
import { AnswerWalletSummaryChain } from './ai/chains/answer-wallet-summary.chain';
import { ClassifyQuestionChain } from './ai/chains/classify-question.chain';
import { ComposeAnswerChain } from './ai/chains/compose-answer.chain';
import { RouteToolsChain } from './ai/chains/route-tools.chain';
import { WalletAgent } from './ai/agents/wallet-agent';
import { OpenAiClient } from './ai/llm/openai.client';
import { MemWalService } from './ai/memory/memwal.service';
import { ChatOrchestratorService } from './ai/orchestrator/chat-orchestrator.service';
import { ToolCallLoop } from './ai/orchestrator/tool-call.loop';
import { AiToolRegistry } from './ai/orchestrator/tool-registry';
import { GetActivityTool } from './ai/tools/get-activity.tool';
import { GetFeeSummaryTool } from './ai/tools/get-fee-summary.tool';
import { GetObjectSummaryTool } from './ai/tools/get-object-summary.tool';
import { GetPortfolioTool } from './ai/tools/get-portfolio.tool';
import { GetProtocolUsageTool } from './ai/tools/get-protocol-usage.tool';
import { GetRiskFlagsTool } from './ai/tools/get-risk-flags.tool';
import { GetWalletSummaryTool } from './ai/tools/get-wallet-summary.tool';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AnalyticsController } from './analytics/analytics.controller';
import { AnalyticsService } from './analytics/analytics.service';
import { ChatController } from './chat/chat.controller';
import { ChatService } from './chat/chat.service';
import { DataController } from './data/data.controller';
import { DataService } from './data/data.service';
import { DatabaseService } from './database/database.service';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { QueueService } from './queue/queue.service';
import { SyncController } from './sync/sync.controller';
import { SyncService } from './sync/sync.service';
import { RedisService } from './queue/redis.service';
import { SuiClientService } from './sui/sui-client.service';
import { SuiIngestionService } from './sui/sui-ingestion.service';
import { SuiNormalizationService } from './sui/sui-normalization.service';
import { SuiRpcCacheService } from './sui/sui-rpc-cache.service';
import { SuiSyncPlannerService } from './sui/sui-sync-planner.service';
import { TokenPriceController } from './pricing/token-price.controller';
import { TokenPriceService } from './pricing/token-price.service';
import { WalletController } from './wallet/wallet.controller';
import { WalletService } from './wallet/wallet.service';
import { MetricsService } from './observability/metrics.service';

@Module({
  controllers: [AuthController, AnalyticsController, DataController, WalletController, HealthController, SyncController, ChatController, TokenPriceController],
  providers: [
    AuthService,
    AnalyticsService,
    DataService,
    WalletService,
    MetricsService,
    HealthService,
    SyncService,
    ChatService,
    DatabaseService,
    RedisService,
    QueueService,
    SuiClientService,
    SuiRpcCacheService,
    SuiSyncPlannerService,
    TokenPriceService,
    SuiIngestionService,
    SuiNormalizationService,
    MemWalService,
    ClassifyQuestionChain,
    OpenAiClient,
    AiToolRegistry,
    RouteToolsChain,
    ToolCallLoop,
    ComposeAnswerChain,
    ChatOrchestratorService,
    AnswerWalletSummaryChain,
    AnswerPortfolioChain,
    AnswerFeeChain,
    AnswerActivityChain,
    AnswerObjectChain,
    GetWalletSummaryTool,
    GetFeeSummaryTool,
    GetPortfolioTool,
    GetActivityTool,
    GetProtocolUsageTool,
    GetObjectSummaryTool,
    GetRiskFlagsTool,
    WalletAgent,
  ],
})
export class AppModule {}
