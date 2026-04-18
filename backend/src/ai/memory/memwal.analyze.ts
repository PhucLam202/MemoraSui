import { MemWalService } from './memwal.service';

export async function analyzeMemory(service: MemWalService, text: string, namespace: string) {
  return service.analyze(text, namespace);
}
