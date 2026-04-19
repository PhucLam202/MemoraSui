import { Body, Controller, Get, Headers, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
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
  async sendMessage(@Body() body: Record<string, unknown>, @Headers('accept') accept = '', @Res() res: Response) {
    const input = {
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
      walletId: String(body.walletId ?? ''),
      content: String(body.content ?? ''),
    };

    if (accept.includes('text/event-stream')) {
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      const emit = (event: Record<string, unknown>) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      try {
        const response = await this.chatService.sendMessageStream(input, emit);
        emit({
          type: 'final',
          response,
          timestamp: Date.now(),
        });
      } catch (error) {
        emit({
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to stream chat response.',
          timestamp: Date.now(),
        });
      } finally {
        res.end();
      }
      return;
    }

    const response = await this.chatService.sendMessage(input);
    res.json(response);
  }

  @Post('messages/stream')
  async sendMessageStream(@Body() body: Record<string, unknown>, @Res() res: Response) {
    return this.sendMessage(body, 'text/event-stream', res);
  }

  @Get('sessions/:sessionId/messages')
  getConversationHistory(@Param('sessionId') sessionId: string, @Query() query: Record<string, unknown> = {}) {
    return this.chatService.getConversationHistory(sessionId, parsePagination(query));
  }
}
