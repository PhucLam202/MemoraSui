import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { parseNetwork, parsePagination } from '../common/query.utils';
import { WalletService } from './wallet.service';

@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post()
  createWallet(
    @Body() body: Record<string, unknown>,
    @Headers('x-user-id') requestedBy?: string,
  ) {
    return this.walletService.createWallet({
      address: String(body.address ?? ''),
      label: typeof body.label === 'string' ? body.label : undefined,
      network: parseNetwork(body.network),
      userId: typeof body.userId === 'string' ? body.userId : requestedBy,
      isPrimary: typeof body.isPrimary === 'boolean' ? body.isPrimary : undefined,
    });
  }

  @Get(':walletId')
  getWallet(@Param('walletId') walletId: string, @Query('network') network?: string) {
    return this.walletService.getWallet(walletId, parseNetwork(network));
  }

  @Get()
  listWallets(@Query() query: Record<string, unknown> = {}) {
    return this.walletService.listWallets({
      userId: typeof query.userId === 'string' ? query.userId : undefined,
      address: typeof query.address === 'string' ? query.address : undefined,
      network: parseNetwork(query.network),
      search: typeof query.search === 'string' ? query.search : null,
      pagination: parsePagination(query),
    });
  }
}
