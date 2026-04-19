import { Controller, Get, Query } from '@nestjs/common';
import { TokenPriceService } from './token-price.service';

@Controller('pricing')
export class TokenPriceController {
  constructor(private readonly tokenPriceService: TokenPriceService) {}

  @Get('price')
  async getPrice(@Query('symbol') symbol: string = 'SUI') {
    const result = await this.tokenPriceService.getTokenPrice(symbol, 1);
    return {
      symbol: symbol.toUpperCase(),
      priceUsd: result.priceUsd,
      timestamp: Date.now(),
    };
  }
}
