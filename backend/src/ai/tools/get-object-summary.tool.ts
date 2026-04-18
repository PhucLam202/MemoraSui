import { Injectable } from '@nestjs/common';
import { DataService } from '../../data/data.service';
import type { SuiNetwork } from '../../sui/sui.types';

@Injectable()
export class GetObjectSummaryTool {
  constructor(private readonly dataService: DataService) {}

  async run(walletAddress: string, network?: SuiNetwork) {
    return this.dataService.getObjectSummary(walletAddress, network);
  }
}
