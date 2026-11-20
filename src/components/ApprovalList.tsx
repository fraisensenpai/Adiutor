import { useStore } from '@/state/store';
import { roleLabel } from '@/lib/format';
import { AlertIcon, CheckIcon, XIcon } from './ui/Icons';

/** Onay bekleyen ajan görevleri ve komutlar. Onaylanmadan hiçbir adım yürütülmez. */
export function ApprovalList({ compact = false }: { compact?: boolean }) {
  const approvals = useStore((state) => state.approvals);
  const approve = useStore((state) => state.approve);
  const reject = useStore((state) => state.reject);
  const pending = approvals.filter((approval) => approval.status === 'pending');
  const decided = approvals.filter((approval) => approval.status !== 'pending').slice(-2);

  if (pending.length === 0 && decided.length === 0) {
    if (compact) return null;
    return (
      <div className="dim" style={{ fontSize: 11 }}>
        Onay bekleyen adım yok. Ajanlar yeni bir görev veya komut önerdiğinde burada görünür.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {!compact && pending.length > 0 ? (
        <div className="dim" style={{ fontSize: 11 }}>
          {pending.length} adım onay bekliyor. Onaylamadan hiçbir görev veya komut çalıştırılmaz.
        </div>
      ) : null}
      {pending.map((approval) => (
        <div className="approval-card" key={approval.id} role="group" aria-label={`Onay: ${approval.title}`}>
          <div className="approval-head">
            <AlertIcon size={13} />
            {approval.type === 'command' ? 'Komut onayı' : 'Yeni görev onayı'} · {roleLabel(approval.from)}
          </div>
          <div className="approval-title">{approval.title}</div>
          <div className="approval-desc">{approval.description}</div>
          {approval.command ? <div className="approval-command">$ {approval.command}</div> : null}
          <div className="approval-actions">
            <button type="button" className="button button-primary button-small" onClick={() => approve(approval.id)}>
              <CheckIcon size={12} />
              {approval.type === 'command' ? 'Çalıştırmayı onayla' : 'Görevi onayla'}
            </button>
            <button type="button" className="button button-ghost button-small" onClick={() => reject(approval.id)}>
              <XIcon size={12} />
              Reddet
            </button>
          </div>
        </div>
      ))}
      {decided.map((approval) => (
        <div className="dim" key={approval.id} style={{ fontSize: 11 }}>
          {approval.status === 'approved' ? 'Onaylandı' : 'Reddedildi'}: {approval.title}
        </div>
      ))}
    </div>
  );
}
