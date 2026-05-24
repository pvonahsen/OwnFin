const _checkOk = r =>
  r.ok ? r.json() : r.json().catch(() => ({})).then(body => {
    throw new Error(body?.detail || body?.message || r.statusText || `HTTP ${r.status}`);
  });

export const api = {
  get:   url      => fetch(url).then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
  post:  (url, d) => fetch(url, { method: 'POST',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }).then(_checkOk),
  put:   (url, d) => fetch(url, { method: 'PUT',   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }).then(_checkOk),
  patch: (url, d) => fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }).then(_checkOk),
  del:   url      => fetch(url, { method: 'DELETE' }).then(_checkOk),
};

export function ownerUrl(url, owner) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}owner=${owner}`;
}
