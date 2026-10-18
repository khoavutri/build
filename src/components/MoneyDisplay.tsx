import { formatMoney } from '../utils/money';

export function MoneyDisplay({ value, strong, muted, danger }: { value?: number | null; strong?: boolean; muted?: boolean; danger?: boolean }) {
  if (value == null) return <span className="text-muted">—</span>;
  return (
    <span
      className={[strong ? 'text-strong' : '', muted ? 'text-muted' : '', 'nowrap'].filter(Boolean).join(' ')}
      style={danger && value > 0 ? { color: '#c0392b' } : undefined}
    >
      {formatMoney(value)}
    </span>
  );
}
