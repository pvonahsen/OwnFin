export default function Card({ title, children, className = '', action }) {
  return (
    <div className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head">
          {title && <h3 className="card-title">{title}</h3>}
          {action}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  );
}
