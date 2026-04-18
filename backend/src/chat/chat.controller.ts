import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { parsePagination } from '../common/query.utils';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('sessions')
  createSession(@Body() body: Record<string, unknown>) {
    return this.chatService.createSession({
      walletId: String(body.walletId ?? ''),
      title: typeof body.title === 'string' ? body.title : undefined,
    });
  }

  @Get('sessions')
  listSessions(@Query() query: Record<string, unknown> = {}) {
    return this.chatService.listSessions(String(query.walletId ?? ''), parsePagination(query));
  }

  @Post('messages')
  sendMessage(@Body() body: Record<string, unknown>) {
    return this.chatService.sendMessage({
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
      walletId: String(body.walletId ?? ''),
      content: String(body.content ?? ''),
    });
  }

  @Get('sessions/:sessionId/messages')
  getConversationHistory(@Param('sessionId') sessionId: string, @Query() query: Record<string, unknown> = {}) {
    return this.chatService.getConversationHistory(sessionId, parsePagination(query));
  }
}
