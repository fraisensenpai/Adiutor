/**
 * Ajanların ürettiği yeni görevler ve komutlar, kullanıcı onayı gelene kadar
 * burada bekler. Onay verilmeden hiçbir adım yürütülmez.
 */

const resolvers = new Map<string, (approved: boolean) => void>();

export function awaitApproval(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    resolvers.set(id, resolve);
  });
}

export function settleApproval(id: string, approved: boolean): void {
  const resolve = resolvers.get(id);
  if (!resolve) return;
  resolvers.delete(id);
  resolve(approved);
}

export function settleAllApprovals(approved: boolean): void {
  for (const [id, resolve] of resolvers) {
    resolvers.delete(id);
    resolve(approved);
  }
}

export function pendingApprovalCount(): number {
  return resolvers.size;
}
