import { MemWalService } from './memwal.service';

export async function rememberMemory(service: MemWalService, text: string, namespace: string) {
  return service.remember(text, namespace);
}
