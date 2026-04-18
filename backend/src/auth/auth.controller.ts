import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';

type RequestMetadata = {
  ipAddress?: string;
  userAgent?: string;
};

function getRequestMetadata(request: Request): RequestMetadata {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('challenge')
  createChallenge(@Body() body: unknown, @Req() request: Request) {
    return this.authService.createChallenge(body, getRequestMetadata(request));
  }

  @Post('verify')
  verifySignature(@Body() body: unknown, @Req() request: Request) {
    return this.authService.verifyChallenge(body, getRequestMetadata(request));
  }

  @Post('refresh')
  refreshSession(@Body() body: unknown, @Req() request: Request) {
    return this.authService.refreshSession(body, getRequestMetadata(request));
  }

  @Post('revoke')
  revokeSession(@Body() body: unknown) {
    return this.authService.revokeSession(body);
  }
}
