// Tiny DOM helpers for the menu screens (no framework).
//
//   el('div', { class: 'x', text: 'hi', onclick: fn, dataset: { key: 'a' } }, child, 'text', [more])
//
// Props: class, text, html (trusted strings only), style (object), dataset, on<event> (function),
// anything else becomes an attribute (true → empty attribute, false/null → skipped).

export function el(tag, props = null, ...children) {
  const node = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(node, c);
    else node.append(c.nodeType ? c : String(c));
  }
}

/** Remove every child. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Elements the menu keyboard / gamepad navigation can land on, in document order. */
export function focusablesIn(root) {
  const list = root.querySelectorAll('button:not([disabled]), input:not([disabled]), [data-nav]');
  const out = [];
  for (const n of list) {
    if (n.closest('[hidden]')) continue;
    if (n.offsetParent === null && getComputedStyle(n).position !== 'fixed') continue;
    out.push(n);
  }
  return out;
}

/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb color. */
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt >= 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  const h = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** #rrggbb → "r, g, b" for rgba() in inline styles. */
export function rgbTriplet(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
