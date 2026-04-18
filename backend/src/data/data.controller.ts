import { Controller, Get, Param, Query } from '@nestjs/common';
import { parseDateRange, parseNetwork, parsePagination } from '../common/query.utils';
import { DataService } from './data.service';

@Controller('data')
export class DataController {
  constructor(private readonly dataService: DataService) {}

  @Get('wallets/:walletAddress/transactions')
  getTransactions(@Param('walletAddress') walletAddress: string, @Query() query: Record<string, unknown> = {}) {
    return this.dataService.getTransactions({
      walletAddress,
      network: parseNetwork(query.network),
      range: parseDateRange(query),
      pagination: parsePagination(query),
      search: typeof query.search === 'string' ? query.search : null,
      sortBy: typeof query.sortBy === 'string' ? query.sortBy : undefined,
      sortOrder: typeof query.sortOrder === 'string' ? query.sortOrder : undefined,
    });
  }

  @Get('wallets/:walletAddress/events')
  getEvents(@Param('walletAddress') walletAddress: string, @Query() query: Record<string, unknown> = {}) {
    return this.dataService.getNormalizedEvents({
      walletAddress,
      network: parseNetwork(query.network),
      range: parseDateRange(query),
      pagination: parsePagination(query),
      search: typeof query.search === 'string' ? query.search : null,
      sortBy: typeof query.sortBy === 'string' ? query.sortBy : undefined,
      sortOrder: typeof query.sortOrder === 'string' ? query.sortOrder : undefined,
    });
  }

  @Get('wallets/:walletAddress/balances')
  getBalances(@Param('walletAddress') walletAddress: string, @Query() query: Record<string, unknown> = {}) {
    return this.dataService.getBalances({
      walletAddress,
      network: parseNetwork(query.network),
      range: parseDateRange(query),
      pagination: parsePagination(query),
      search: typeof query.search === 'string' ? query.search : null,
      sortBy: typeof query.sortBy === 'string' ? query.sortBy : undefined,
      sortOrder: typeof query.sortOrder === 'string' ? query.sortOrder : undefined,
    });
  }

  @Get('wallets/:walletAddress/objects')
  getObjects(@Param('walletAddress') walletAddress: string, @Query() query: Record<string, unknown> = {}) {
    return this.dataService.getObjects({
      walletAddress,
      network: parseNetwork(query.network),
      range: parseDateRange(query),
      pagination: parsePagination(query),
      search: typeof query.search === 'string' ? query.search : null,
      sortBy: typeof query.sortBy === 'string' ? query.sortBy : undefined,
      sortOrder: typeof query.sortOrder === 'string' ? query.sortOrder : undefined,
    });
  }

  @Get('wallets/:walletAddress/snapshot')
  getSnapshot(@Param('walletAddress') walletAddress: string, @Query() query: Record<string, unknown> = {}) {
    return this.dataService.getSnapshot(walletAddress, parseNetwork(query.network), parseDateRange(query));
  }
}
