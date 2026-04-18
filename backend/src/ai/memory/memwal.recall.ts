import { MemWalService } from './memwal.service';

export async function recallMemories(service: MemWalService, query: string, namespace: string, limit = 5) {
  return service.recall(query, limit, namespace);
}
