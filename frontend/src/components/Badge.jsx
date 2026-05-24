const cls = {
  übergewichtet: 'pill pill-neg',
  untergewichtet: 'pill pill-warn',
  ok: 'pill pill-pos',
};

export default function Badge({ action }) {
  return <span className={cls[action] || 'pill'}>{action}</span>;
}
