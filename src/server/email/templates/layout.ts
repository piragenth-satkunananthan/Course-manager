// Plain HTML with inline styles and no images (design file 36). Everything interpolated is escaped.
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function layout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:system-ui,sans-serif;color:#0f172a">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>${body}
<p style="margin:24px 0 0;font-size:13px;color:#475569">Course-manager · times are in Sri Lanka time</p></div></body></html>`;
}
