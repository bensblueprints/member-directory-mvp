export async function api(path, { method = 'GET', body, raw } = {}) {
  const res = await fetch(path, {
    method,
    headers: body && !raw ? { 'Content-Type': 'application/json' } : raw ? { 'Content-Type': 'text/csv' } : {},
    body: body ? (raw ? body : JSON.stringify(body)) : undefined,
    credentials: 'same-origin'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}
