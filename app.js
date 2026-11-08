'use strict';
/* ============ utilidades ============ */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const now = () => Date.now();
const hoy = () => new Date().toLocaleDateString('en-CA');
const mesActual = () => hoy().slice(0, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const sum = a => a.reduce((x, y) => x + y, 0);
const NF = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n, cur = 'USD') => cur === 'VES' ? 'Bs ' + NF.format(n) : cur === 'USDT' ? NF.format(n) + ' USDT' : '$ ' + NF.format(n);
const fFecha = f => f ? new Date(f + 'T12:00').toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const fMes = m => new Date(m + '-15T12:00').toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
};

const COLS = ['clientes', 'movimientos', 'empleados', 'nominas', 'pendientes', 'notas'];
const CAT = {
  gasto: ['Nómina', 'Software y suscripciones', 'Créditos IA', 'Equipos', 'Internet y teléfono', 'Alquiler', 'Servicios', 'Transporte', 'Publicidad', 'Impuestos', 'Comida', 'Otros'],
  ingreso: ['Diseño', 'Video / motion', 'Redes sociales', 'Branding', 'Fotografía', 'Otros']
};
const METODOS = ['Transferencia', 'Pago móvil', 'Efectivo', 'Zelle', 'Binance', 'Otro'];
const MONEDAS = ['USD', 'VES', 'USDT'];

/* ============ datos ============ */
function emptyData() {
  return {
    v: 1, clientes: [], movimientos: [], empleados: [], nominas: [], pendientes: [], notas: [], deleted: {},
    ajustes: { negocio: { nombre: 'Mulato Ediciones', rif: '', telefono: '', email: '', direccion: '' }, tasa: { valor: 0, fecha: '' }, updatedAt: 0 }
  };
}
function normalize(x) {
  const e = emptyData();
  x = x || {};
  const out = { v: 1 };
  for (const c of COLS) out[c] = (x[c] || []).slice().sort((a, b) => a.id < b.id ? -1 : 1);
  out.deleted = {};
  for (const k of Object.keys(x.deleted || {}).sort()) out.deleted[k] = x.deleted[k];
  const a = x.ajustes || {};
  out.ajustes = {
    negocio: Object.assign(e.ajustes.negocio, a.negocio || {}),
    tasa: Object.assign(e.ajustes.tasa, a.tasa || {}),
    updatedAt: a.updatedAt || 0
  };
  return out;
}
function merge(local, remote) {
  const out = { deleted: Object.assign({}, local.deleted, remote.deleted), ajustes: (local.ajustes.updatedAt > remote.ajustes.updatedAt) ? local.ajustes : remote.ajustes };
  for (const c of COLS) {
    const m = new Map();
    for (const r of [...remote[c], ...local[c]]) {
      const p = m.get(r.id);
      if (!p || (r.updatedAt || 0) > (p.updatedAt || 0)) m.set(r.id, r);
    }
    out[c] = [...m.values()].filter(r => !out.deleted[r.id]);
  }
  return normalize(out);
}

let D = normalize(store.get('am_data'));
let meta = store.get('am_meta') || { sha: '', dirty: false };
let cfg = store.get('am_cfg') || { owner: '', repo: '', path: 'datos.json', token: '' };
const ui = { mes: mesActual(), tipo: 'todos', q: '', pend: 'abiertos', nom: 'pagos' };

const byId = (col, id) => D[col].find(r => r.id === id);
const clienteNombre = id => byId('clientes', id)?.nombre || '';
const tasaHoy = () => D.ajustes.tasa.valor || 0;
const toUSD = m => m.moneda === 'VES' ? ((m.tasa || tasaHoy()) ? num(m.monto) / (m.tasa || tasaHoy()) : 0) : num(m.monto);

function put(col, rec) {
  rec.updatedAt = now();
  const i = D[col].findIndex(r => r.id === rec.id);
  if (i >= 0) D[col][i] = rec; else D[col].push(rec);
}
function del(col, id) { D[col] = D[col].filter(r => r.id !== id); D.deleted[id] = now(); }
function commit() {
  D = normalize(D);
  store.set('am_data', D);
  meta.dirty = true; store.set('am_meta', meta);
  render();
  clearTimeout(commit.t); commit.t = setTimeout(sync, 1200);
}

/* ============ sincronización con GitHub ============ */
const configured = () => cfg.owner && cfg.repo && cfg.token && cfg.path;
const enc = s => { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(bin); };
const dec = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));
function gh(method, body, accept) {
  const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}`;
  return fetch(url, {
    method, cache: 'no-store',
    headers: { Authorization: 'Bearer ' + cfg.token, Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: body ? JSON.stringify(body) : undefined
  });
}
async function ghError(r) {
  let m = ''; try { m = (await r.json()).message; } catch (e) { }
  if (r.status === 401) return 'El token no es válido o venció. Crea uno nuevo en Ajustes.';
  if (r.status === 403) return 'El token no tiene permiso de escritura sobre ese repositorio.';
  if (r.status === 404) return 'No encuentro el repositorio. Revisa usuario y nombre en Ajustes.';
  return `GitHub respondió ${r.status}${m ? ': ' + m : ''}`;
}
let syncing = false, syncAgain = false, lastError = '';
function setStatus(s, msg) {
  const b = $('#sync'); b.dataset.s = s; lastError = msg || '';
  $('#syncTxt').textContent = { ok: 'Sincronizado', sync: 'Guardando…', local: 'Solo local', error: 'Error', offline: 'Sin conexión' }[s];
  b.title = msg || 'Sincronizar ahora';
}
async function sync() {
  if (!configured()) { setStatus('local'); return; }
  if (syncing) { syncAgain = true; return; }
  syncing = true; setStatus('sync');
  const before = JSON.stringify(D);
  try {
    for (let intento = 0; intento < 3; intento++) {
      const r = await gh('GET');
      let remote = null, sha = '';
      if (r.status === 200) {
        const j = await r.json(); sha = j.sha;
        const txt = j.content ? dec(j.content) : await (await gh('GET', null, 'application/vnd.github.raw')).text();
        remote = normalize(JSON.parse(txt));
      } else if (r.status !== 404) throw new Error(await ghError(r));
      else {
        // 404: ¿no existe el archivo o no existe el repo?
        const rr = await fetch(`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`, { cache: 'no-store', headers: { Authorization: 'Bearer ' + cfg.token } });
        if (!rr.ok) throw new Error(await ghError(rr));
      }
      const merged = remote ? merge(D, remote) : D;
      D = merged; store.set('am_data', D);
      if (remote && JSON.stringify(merged) === JSON.stringify(remote)) { meta = { sha, dirty: false }; break; }
      const p = await gh('PUT', { message: 'Actualización ' + new Date().toISOString(), content: enc(JSON.stringify(merged, null, 1)), ...(sha ? { sha } : {}) });
      if (p.ok) { meta = { sha: (await p.json()).content.sha, dirty: false }; break; }
      if (p.status === 409 || p.status === 422) continue;
      throw new Error(await ghError(p));
    }
    store.set('am_meta', meta);
    setStatus('ok');
  } catch (e) {
    setStatus(navigator.onLine ? 'error' : 'offline', navigator.onLine ? e.message : 'Los cambios quedan guardados en este dispositivo y se suben al volver la conexión.');
  } finally {
    syncing = false;
    if (JSON.stringify(D) !== before && !$('#dlg').open) render();
    if (syncAgain) { syncAgain = false; sync(); }
  }
}

/* ============ iconos ============ */
const I = {
  inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  movimientos: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
  clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.5 3.5 5.2"/>',
  pendientes: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  mas: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  nominas: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
  notas: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>'
};
const ico = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

/* ============ navegación ============ */
const VISTAS = {
  inicio: 'Inicio', movimientos: 'Movimientos', clientes: 'Clientes', pendientes: 'Pendientes',
  nominas: 'Nóminas', notas: 'Notas de entrega', ajustes: 'Ajustes', mas: 'Más'
};
const ruta = () => { const r = location.hash.replace('#/', ''); return VISTAS[r] ? r : 'inicio'; };
function nav() {
  const r = ruta();
  const link = (k, label) => `<a href="#/${k}" class="${r === k || (k === 'mas' && ['nominas', 'notas', 'ajustes'].includes(r)) ? 'on' : ''}">${ico(k)}<span>${label}</span></a>`;
  $('#bottom').innerHTML = link('inicio', 'Inicio') + link('movimientos', 'Movim.') + link('clientes', 'Clientes') + link('pendientes', 'Pendientes') + link('mas', 'Más');
  $('#side').innerHTML = `<div class="brand">${esc(D.ajustes.negocio.nombre || 'Mi Negocio')}</div>` +
    ['inicio', 'movimientos', 'clientes', 'pendientes', 'nominas', 'notas', 'ajustes'].map(k => link(k, VISTAS[k])).join('');
}
const FAB = { movimientos: 'movimientos', clientes: 'clientes', pendientes: 'pendientes', notas: 'notas', inicio: 'movimientos' };
function render() {
  const r = ruta();
  nav();
  $('#title').textContent = VISTAS[r];
  document.title = VISTAS[r] + ' · Mi Negocio';
  const focus = document.activeElement?.id;
  $('#view').innerHTML = V[r]();
  if (focus === 'q') { const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  const fab = $('#fab');
  const col = r === 'nominas' ? (ui.nom === 'pagos' ? 'nominas' : 'empleados') : FAB[r];
  fab.hidden = !col; fab.dataset.new = col || '';
  fab.setAttribute('aria-label', r === 'nominas' ? (ui.nom === 'pagos' ? 'Nueva nómina' : 'Nuevo empleado') : 'Agregar');
}

/* ============ vistas ============ */
const empty = (txt, col, btn) => `<div class="empty"><p>${txt}</p>${col ? `<button class="btn pri" data-new="${col}">${btn}</button>` : ''}</div>`;
function movRow(m) {
  const sub = [m.categoria, clienteNombre(m.clienteId), m.metodo].filter(Boolean).join(' · ');
  const usd = m.moneda === 'VES' ? `<small>${fmt(toUSD(m))}</small>` : '';
  return `<li class="row" data-edit="movimientos:${m.id}"><div class="grow"><div class="t">${esc(m.descripcion || m.categoria || (m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'))}</div><div class="s">${esc(sub)}</div></div>
  <div class="amt ${m.tipo === 'ingreso' ? 'in' : 'out'}">${m.tipo === 'ingreso' ? '+' : '−'} ${fmt(num(m.monto), m.moneda)}${usd}</div></li>`;
}
function pendRow(p) {
  const venc = !p.hecho && p.fecha && p.fecha < hoy();
  const sub = [p.fecha ? fFecha(p.fecha) : '', clienteNombre(p.clienteId)].filter(Boolean).join(' · ');
  return `<li class="row ${p.hecho ? 'done' : ''}" data-edit="pendientes:${p.id}">
  <button class="chk ${p.hecho ? 'on' : ''}" data-toggle="${p.id}" aria-label="${p.hecho ? 'Marcar como no hecho' : 'Marcar como hecho'}">${p.hecho ? ico('check') : ''}</button>
  <div class="grow"><div class="t">${esc(p.titulo)}</div><div class="s">${p.tipo !== 'tarea' ? `<span class="tag ${p.tipo === 'cobro' ? 'cobro' : ''}">${p.tipo === 'cobro' ? 'Cobro' : 'Pago'}</span> ` : ''}${venc ? '<span class="tag vencido">Vencido</span> ' : ''}${esc(sub)}</div></div>
  ${num(p.monto) ? `<div class="amt">${fmt(num(p.monto), p.moneda)}</div>` : ''}</li>`;
}
const mesInput = () => `<input type="month" value="${ui.mes}" data-ui="mes" aria-label="Mes" style="width:auto">`;

const V = {
  inicio() {
    const ms = D.movimientos.filter(m => (m.fecha || '').startsWith(ui.mes));
    const ing = sum(ms.filter(m => m.tipo === 'ingreso').map(toUSD));
    const gas = sum(ms.filter(m => m.tipo === 'gasto').map(toUSD));
    const cobros = D.pendientes.filter(p => !p.hecho && p.tipo === 'cobro');
    const porCobrar = sum(cobros.map(toUSD));
    const cats = {};
    ms.filter(m => m.tipo === 'gasto').forEach(m => cats[m.categoria || 'Otros'] = (cats[m.categoria || 'Otros'] || 0) + toUSD(m));
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = top[0]?.[1] || 1;
    const prox = D.pendientes.filter(p => !p.hecho).sort((a, b) => (a.fecha || '9') < (b.fecha || '9') ? -1 : 1).slice(0, 5);
    const ult = D.movimientos.slice().sort((a, b) => (b.fecha + b.updatedAt) > (a.fecha + a.updatedAt) ? 1 : -1).slice(0, 6);
    const ganancia = ing - gas;
    return `${!configured() ? `<div class="banner"><span>Tus datos solo están en este dispositivo. Conecta GitHub para verlos en el teléfono y la laptop.</span><a class="btn sm pri" href="#/ajustes">Conectar</a></div>` : ''}
    ${!tasaHoy() ? `<div class="banner"><span>Configura la tasa del dólar para convertir los montos en bolívares.</span><a class="btn sm" href="#/ajustes">Poner tasa</a></div>` : ''}
    <div class="tools">${mesInput()}<span class="muted" style="font-size:13px">Montos en dólares${tasaHoy() ? ` · tasa Bs ${NF.format(tasaHoy())}` : ''}</span></div>
    <div class="kpis">
      <div class="kpi"><small>Ingresos</small><b class="in">${fmt(ing)}</b></div>
      <div class="kpi"><small>Gastos</small><b class="out">${fmt(gas)}</b></div>
      <div class="kpi"><small>Ganancia</small><b class="${ganancia >= 0 ? 'in' : 'out'}">${fmt(ganancia)}</b></div>
      <div class="kpi"><small>Por cobrar (${cobros.length})</small><b>${fmt(porCobrar)}</b></div>
    </div>
    <div class="grid2">
      <div class="card"><h2>Pendientes <a class="lnk" href="#/pendientes">Ver todos</a></h2>${prox.length ? `<ul class="list">${prox.map(pendRow).join('')}</ul>` : empty('No tienes pendientes abiertos.', 'pendientes', 'Agregar pendiente')}</div>
      <div class="card"><h2>Gastos por categoría</h2>${top.length ? `<ul class="list bars">${top.map(([k, v]) => `<li><div><span>${esc(k)}</span><b>${fmt(v)}</b></div><div class="bar"><i style="width:${(v / max * 100).toFixed(1)}%"></i></div></li>`).join('')}</ul>` : `<div class="empty"><p>Sin gastos en ${fMes(ui.mes)}.</p></div>`}</div>
    </div>
    <div class="card"><h2>Últimos movimientos <a class="lnk" href="#/movimientos">Ver todos</a></h2>${ult.length ? `<ul class="list">${ult.map(movRow).join('')}</ul>` : empty('Registra tu primer ingreso o gasto.', 'movimientos', 'Registrar movimiento')}</div>`;
  },

  movimientos() {
    const q = ui.q.toLowerCase();
    const ms = D.movimientos.filter(m => (m.fecha || '').startsWith(ui.mes) && (ui.tipo === 'todos' || m.tipo === ui.tipo) &&
      (!q || [m.descripcion, m.categoria, clienteNombre(m.clienteId), m.metodo].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => (b.fecha + b.updatedAt) > (a.fecha + a.updatedAt) ? 1 : -1);
    const ing = sum(ms.filter(m => m.tipo === 'ingreso').map(toUSD)), gas = sum(ms.filter(m => m.tipo === 'gasto').map(toUSD));
    let html = '', dia = '';
    for (const m of ms) { if (m.fecha !== dia) { if (dia) html += '</ul>'; dia = m.fecha; html += `<p class="day">${fFecha(dia)}</p><ul class="list">`; } html += movRow(m); }
    if (dia) html += '</ul>';
    return `<div class="tools">${mesInput()}
      <div class="seg">${['todos', 'ingreso', 'gasto'].map(t => `<button class="${ui.tipo === t ? 'on' : ''}" data-ui="tipo" data-v="${t}">${{ todos: 'Todos', ingreso: 'Ingresos', gasto: 'Gastos' }[t]}</button>`).join('')}</div>
      <input type="search" id="q" placeholder="Buscar" value="${esc(ui.q)}" data-ui="q" aria-label="Buscar movimientos"></div>
    <div class="kpis"><div class="kpi"><small>Ingresos</small><b class="in">${fmt(ing)}</b></div><div class="kpi"><small>Gastos</small><b class="out">${fmt(gas)}</b></div><div class="kpi"><small>Balance</small><b>${fmt(ing - gas)}</b></div><div class="kpi"><small>Movimientos</small><b>${ms.length}</b></div></div>
    <div class="card">${ms.length ? html : (ui.q || ui.tipo !== 'todos' ? `<div class="empty"><p>Nada coincide con el filtro.</p><button class="btn" data-ui="reset">Quitar filtros</button></div>` : empty(`Sin movimientos en ${fMes(ui.mes)}.`, 'movimientos', 'Registrar movimiento'))}</div>`;
  },

  clientes() {
    const q = ui.q.toLowerCase();
    const cs = D.clientes.filter(c => !q || [c.nombre, c.rif, c.telefono, c.email].join(' ').toLowerCase().includes(q)).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const anio = hoy().slice(0, 4);
    return `<div class="tools"><input type="search" id="q" placeholder="Buscar cliente" value="${esc(ui.q)}" data-ui="q" aria-label="Buscar clientes"></div>
    <div class="card">${cs.length ? `<ul class="list">${cs.map(c => {
      const fact = sum(D.movimientos.filter(m => m.clienteId === c.id && m.tipo === 'ingreso' && (m.fecha || '').startsWith(anio)).map(toUSD));
      const debe = sum(D.pendientes.filter(p => p.clienteId === c.id && p.tipo === 'cobro' && !p.hecho).map(toUSD));
      return `<li class="row" data-edit="clientes:${c.id}"><div class="grow"><div class="t">${esc(c.nombre)}</div><div class="s">${esc([c.rif, c.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto')}</div></div>
      <div class="amt">${fmt(fact)}<small>${debe ? `<span class="warn">debe ${fmt(debe)}</span>` : 'en ' + anio}</small></div></li>`;
    }).join('')}</ul>` : (ui.q ? `<div class="empty"><p>Ningún cliente coincide con "${esc(ui.q)}".</p></div>` : empty('Todavía no tienes clientes.', 'clientes', 'Agregar cliente'))}</div>`;
  },

  pendientes() {
    const ab = ui.pend === 'abiertos';
    const ps = D.pendientes.filter(p => !!p.hecho !== ab).sort((a, b) => ab ? ((a.fecha || '9') < (b.fecha || '9') ? -1 : 1) : (b.updatedAt - a.updatedAt));
    const porCobrar = sum(D.pendientes.filter(p => !p.hecho && p.tipo === 'cobro').map(toUSD));
    const porPagar = sum(D.pendientes.filter(p => !p.hecho && p.tipo === 'pago').map(toUSD));
    return `<div class="tools"><div class="seg">${[['abiertos', 'Abiertos'], ['hechos', 'Hechos']].map(([k, l]) => `<button class="${ui.pend === k ? 'on' : ''}" data-ui="pend" data-v="${k}">${l}</button>`).join('')}</div></div>
    <div class="kpis"><div class="kpi"><small>Por cobrar</small><b class="in">${fmt(porCobrar)}</b></div><div class="kpi"><small>Por pagar</small><b class="out">${fmt(porPagar)}</b></div></div>
    <div class="card">${ps.length ? `<ul class="list">${ps.map(pendRow).join('')}</ul>` : (ab ? empty('No tienes pendientes abiertos.', 'pendientes', 'Agregar pendiente') : '<div class="empty"><p>Aún no has completado pendientes.</p></div>')}</div>`;
  },

  nominas() {
    const tabs = `<div class="tools"><div class="seg">${[['pagos', 'Pagos'], ['empleados', 'Empleados']].map(([k, l]) => `<button class="${ui.nom === k ? 'on' : ''}" data-ui="nom" data-v="${k}">${l}</button>`).join('')}</div></div>`;
    if (ui.nom === 'empleados') {
      const es = D.empleados.slice().sort((a, b) => (b.activo !== false) - (a.activo !== false) || a.nombre.localeCompare(b.nombre));
      return tabs + `<div class="card">${es.length ? `<ul class="list">${es.map(e => `<li class="row" data-edit="empleados:${e.id}"><div class="grow"><div class="t">${esc(e.nombre)}${e.activo === false ? ' <span class="tag">Inactivo</span>' : ''}</div><div class="s">${esc([e.cargo, e.frecuencia].filter(Boolean).join(' · '))}</div></div><div class="amt">${fmt(num(e.salario), e.moneda)}</div></li>`).join('')}</ul>` : empty('Agrega a las personas que cobran nómina.', 'empleados', 'Agregar empleado')}</div>`;
    }
    const ns = D.nominas.slice().sort((a, b) => b.fecha > a.fecha ? 1 : -1);
    const anio = hoy().slice(0, 4);
    const totalAnio = sum(ns.filter(n => n.fecha.startsWith(anio)).map(toUSD));
    return tabs + `<div class="kpis"><div class="kpi"><small>Pagado en ${anio}</small><b>${fmt(totalAnio)}</b></div><div class="kpi"><small>Empleados activos</small><b>${D.empleados.filter(e => e.activo !== false).length}</b></div></div>
    <div class="card">${ns.length ? `<ul class="list">${ns.map(n => `<li class="row" data-edit="nominas:${n.id}"><div class="grow"><div class="t">${esc(n.periodo || 'Nómina')}</div><div class="s">${fFecha(n.fecha)} · ${n.pagos.length} ${n.pagos.length === 1 ? 'persona' : 'personas'}</div></div><div class="amt out">${fmt(num(n.monto), n.moneda)}</div></li>`).join('')}</ul>`
        : D.empleados.length ? empty('Todavía no has registrado pagos de nómina.', 'nominas', 'Registrar nómina') : empty('Primero agrega a tus empleados.', 'empleados', 'Agregar empleado')}</div>`;
  },

  notas() {
    const ns = D.notas.slice().sort((a, b) => b.numero - a.numero);
    const est = { pendiente: 'Por entregar', entregada: 'Entregada', cobrada: 'Cobrada' };
    return `<div class="card">${ns.length ? `<ul class="list">${ns.map(n => `<li class="row" data-edit="notas:${n.id}"><div class="grow"><div class="t">N° ${String(n.numero).padStart(4, '0')} · ${esc(clienteNombre(n.clienteId) || 'Sin cliente')}</div><div class="s"><span class="tag ${n.estado === 'cobrada' ? 'cobro' : ''}">${est[n.estado] || 'Por entregar'}</span> ${fFecha(n.fecha)}</div></div><div class="amt">${fmt(notaTotal(n), n.moneda)}</div></li>`).join('')}</ul>` : empty('Crea notas de entrega para tus clientes y descárgalas en PDF.', 'notas', 'Nueva nota de entrega')}</div>`;
  },

  mas() {
    const t = (k, d) => `<a class="tile" href="#/${k}">${ico(k)}<div><b>${VISTAS[k]}</b><small>${d}</small></div></a>`;
    return `<div class="tiles">${t('nominas', 'Empleados y pagos de nómina')}${t('notas', 'Notas de entrega imprimibles')}${t('ajustes', 'Negocio, tasa, GitHub y respaldos')}</div>`;
  },

  ajustes() {
    const n = D.ajustes.negocio, t = D.ajustes.tasa;
    return `<div class="card"><h2>Tasa del dólar</h2><form class="f" data-form="tasa">
      <div class="two"><label class="l">Bs por 1 USD<input name="valor" inputmode="decimal" value="${t.valor || ''}" required></label><label class="l">Fecha<input type="date" name="fecha" value="${t.fecha || hoy()}"></label></div>
      <div class="actions"><button type="button" class="btn" data-act="bcv">Usar tasa BCV de hoy</button><button class="btn pri">Guardar tasa</button></div></form></div>
    <div class="card"><h2>Datos del negocio</h2><p class="muted" style="margin:-6px 0 12px;font-size:13px">Aparecen en las notas de entrega y recibos de nómina.</p><form class="f" data-form="negocio">
      <label class="l">Nombre<input name="nombre" value="${esc(n.nombre)}" required></label>
      <div class="two"><label class="l">RIF<input name="rif" value="${esc(n.rif)}"></label><label class="l">Teléfono<input name="telefono" type="tel" value="${esc(n.telefono)}"></label></div>
      <label class="l">Correo<input name="email" type="email" value="${esc(n.email)}"></label>
      <label class="l">Dirección<input name="direccion" value="${esc(n.direccion)}"></label>
      <div class="actions"><button class="btn pri">Guardar datos</button></div></form></div>
    <div class="card"><h2>Sincronización con GitHub</h2><p class="muted" style="margin:-6px 0 12px;font-size:13px">Tus datos se guardan en un archivo de un repositorio privado. Usa los mismos datos en el teléfono y en la laptop.</p><form class="f" data-form="github">
      <div class="two"><label class="l">Usuario de GitHub<input name="owner" value="${esc(cfg.owner)}" autocapitalize="off" autocomplete="off" required></label><label class="l">Repositorio privado<input name="repo" value="${esc(cfg.repo)}" placeholder="admin-datos" autocapitalize="off" autocomplete="off" required></label></div>
      <label class="l">Token de acceso<input name="token" type="password" value="${esc(cfg.token)}" placeholder="github_pat_…" autocomplete="off" required></label>
      <label class="l">Archivo<input name="path" value="${esc(cfg.path)}" autocapitalize="off" required></label>
      ${lastError ? `<p class="out" style="margin:0;font-size:13.5px">${esc(lastError)}</p>` : ''}
      <div class="actions">${configured() ? '<button type="button" class="btn dan" data-act="desconectar">Desconectar</button><span class="sp"></span>' : ''}<button class="btn pri">Conectar y sincronizar</button></div></form></div>
    <div class="card"><h2>Respaldo</h2><div class="actions" style="justify-content:flex-start">
      <button class="btn" data-act="csv">Exportar movimientos (Excel)</button><button class="btn" data-act="json">Descargar respaldo</button>
      <label class="btn">Restaurar respaldo<input type="file" accept=".json,application/json" data-act="importar" hidden></label></div></div>`;
  }
};
const notaTotal = n => sum((n.items || []).map(i => num(i.cant) * num(i.precio)));

/* ============ formularios ============ */
const opts = (arr, sel) => arr.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`; }).join('');
const clienteOpts = sel => `<option value="">— Ninguno —</option>` + opts(D.clientes.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map(c => [c.id, c.nombre]), sel);
const monedaTasa = (r, onchange = '') => `<div class="two"><label class="l">Moneda<select name="moneda" data-moneda ${onchange}>${opts(MONEDAS, r.moneda || 'USD')}</select></label>
  <label class="l" data-tasa ${(r.moneda || 'USD') === 'VES' ? '' : 'hidden'}>Tasa (Bs/USD)<input name="tasa" inputmode="decimal" value="${r.tasa || tasaHoy() || ''}"></label></div>`;
const footer = (existe, extra = '') => `<div class="actions">${existe ? '<button type="button" class="btn dan" data-act="eliminar">Eliminar</button>' : ''}<span class="sp"></span>${extra}<button class="btn pri">Guardar</button></div>`;

const F = {
  movimientos(m) {
    const tipo = m.tipo || 'ingreso';
    const cats = [...new Set([...CAT[tipo], ...D.movimientos.filter(x => x.tipo === tipo).map(x => x.categoria).filter(Boolean)])];
    return [m.id ? 'Editar movimiento' : 'Nuevo movimiento', `
    <div class="seg" style="width:100%">${['ingreso', 'gasto'].map(t => `<label style="flex:1;text-align:center"><input type="radio" name="tipo" value="${t}" ${tipo === t ? 'checked' : ''}><span>${t === 'ingreso' ? 'Ingreso' : 'Gasto'}</span></label>`).join('')}</div>
    <div class="two"><label class="l">Monto<input name="monto" inputmode="decimal" value="${m.monto ?? ''}" required autofocus></label><label class="l">Fecha<input type="date" name="fecha" value="${m.fecha || hoy()}" required></label></div>
    ${monedaTasa(m)}
    <label class="l">Descripción<input name="descripcion" value="${esc(m.descripcion)}" placeholder="Ej. Logo para Delisnacks"></label>
    <label class="l">Categoría<input name="categoria" list="cats" value="${esc(m.categoria)}"><datalist id="cats">${opts(cats)}</datalist></label>
    <div class="two"><label class="l">Cliente<select name="clienteId">${clienteOpts(m.clienteId)}</select></label><label class="l">Método<select name="metodo"><option value=""></option>${opts(METODOS, m.metodo)}</select></label></div>
    ${m.nominaId ? '<p class="muted" style="margin:0;font-size:13px">Este gasto viene de una nómina. Edítalo desde Nóminas.</p>' : ''}
    ${footer(m.id && !m.nominaId)}`];
  },
  clientes(c) {
    let resumen = '';
    if (c.id) {
      const ms = D.movimientos.filter(m => m.clienteId === c.id).sort((a, b) => b.fecha > a.fecha ? 1 : -1);
      const tot = sum(ms.filter(m => m.tipo === 'ingreso').map(toUSD));
      const debe = sum(D.pendientes.filter(p => p.clienteId === c.id && p.tipo === 'cobro' && !p.hecho).map(toUSD));
      const tel = (c.telefono || '').replace(/\D/g, '').replace(/^0/, '58');
      resumen = `<div class="kpis" style="margin:0"><div class="kpi"><small>Facturado total</small><b class="in">${fmt(tot)}</b></div><div class="kpi"><small>Te debe</small><b class="${debe ? 'warn' : ''}">${fmt(debe)}</b></div></div>
      ${tel ? `<a class="btn" href="https://wa.me/${tel}" target="_blank" rel="noopener">Escribir por WhatsApp</a>` : ''}
      ${ms.length ? `<details><summary class="muted" style="cursor:pointer">Movimientos (${ms.length})</summary><ul class="list">${ms.slice(0, 20).map(movRow).join('')}</ul></details>` : ''}`;
    }
    return [c.id ? c.nombre : 'Nuevo cliente', `${resumen}
    <label class="l">Nombre o empresa<input name="nombre" value="${esc(c.nombre)}" required ${c.id ? '' : 'autofocus'}></label>
    <div class="two"><label class="l">RIF / Cédula<input name="rif" value="${esc(c.rif)}"></label><label class="l">Teléfono<input name="telefono" type="tel" value="${esc(c.telefono)}" placeholder="0414…"></label></div>
    <label class="l">Correo<input name="email" type="email" value="${esc(c.email)}"></label>
    <label class="l">Dirección<input name="direccion" value="${esc(c.direccion)}"></label>
    <label class="l">Notas<textarea name="notas">${esc(c.notas)}</textarea></label>
    ${footer(c.id)}`];
  },
  pendientes(p) {
    return [p.id ? 'Editar pendiente' : 'Nuevo pendiente', `
    <label class="l">Qué hay que hacer<input name="titulo" value="${esc(p.titulo)}" required autofocus placeholder="Ej. Cobrar video de noviembre"></label>
    <div class="two"><label class="l">Tipo<select name="tipo">${opts([['tarea', 'Tarea'], ['cobro', 'Cobro (me deben)'], ['pago', 'Pago (debo yo)']], p.tipo || 'tarea')}</select></label><label class="l">Fecha límite<input type="date" name="fecha" value="${p.fecha || ''}"></label></div>
    <div class="two"><label class="l">Monto (opcional)<input name="monto" inputmode="decimal" value="${p.monto ?? ''}"></label><label class="l">Moneda<select name="moneda" data-moneda>${opts(MONEDAS, p.moneda || 'USD')}</select></label></div>
    <label class="l">Cliente<select name="clienteId">${clienteOpts(p.clienteId)}</select></label>
    <label class="l">Notas<textarea name="notas">${esc(p.notas)}</textarea></label>
    <label class="check"><input type="checkbox" name="hecho" ${p.hecho ? 'checked' : ''}> Hecho</label>
    ${footer(p.id)}`];
  },
  empleados(e) {
    return [e.id ? e.nombre : 'Nuevo empleado', `
    <label class="l">Nombre completo<input name="nombre" value="${esc(e.nombre)}" required autofocus></label>
    <div class="two"><label class="l">Cédula<input name="cedula" value="${esc(e.cedula)}"></label><label class="l">Cargo<input name="cargo" value="${esc(e.cargo)}" placeholder="Ej. Editor de video"></label></div>
    <div class="two"><label class="l">Salario por pago<input name="salario" inputmode="decimal" value="${e.salario ?? ''}" required></label><label class="l">Moneda<select name="moneda">${opts(MONEDAS, e.moneda || 'USD')}</select></label></div>
    <div class="two"><label class="l">Frecuencia<select name="frecuencia">${opts(['Quincenal', 'Mensual', 'Semanal', 'Por proyecto'], e.frecuencia || 'Quincenal')}</select></label><label class="l">Teléfono<input name="telefono" type="tel" value="${esc(e.telefono)}"></label></div>
    <label class="l">Datos de pago<input name="banco" value="${esc(e.banco)}" placeholder="Banco, pago móvil, Binance…"></label>
    <label class="check"><input type="checkbox" name="activo" ${e.activo !== false ? 'checked' : ''}> Activo (aparece en nuevas nóminas)</label>
    ${footer(e.id)}`];
  },
  nominas(n) {
    const moneda = n.moneda || 'USD';
    const filas = n.id ? n.pagos : D.empleados.filter(e => e.activo !== false).map(e => ({ empleadoId: e.id, nombre: e.nombre, monto: e.moneda === moneda ? num(e.salario) : '', bono: '', deduccion: '', incluir: true }));
    const mes = new Date().toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
    return [n.id ? 'Editar nómina' : 'Nueva nómina', `
    <div class="two"><label class="l">Fecha de pago<input type="date" name="fecha" value="${n.fecha || hoy()}" required></label><label class="l">Período<input name="periodo" value="${esc(n.periodo || (new Date().getDate() <= 15 ? '1ra quincena ' : '2da quincena ') + mes)}" required></label></div>
    ${monedaTasa(n)}
    <div>${filas.length ? filas.map((f, i) => `<div class="prow" data-fila="${i}" data-emp="${f.empleadoId}" data-nombre="${esc(f.nombre)}">
      <input type="checkbox" class="inc" ${f.incluir !== false ? 'checked' : ''} aria-label="Incluir a ${esc(f.nombre)}" style="width:20px;min-height:20px"><b>${esc(f.nombre)}</b>
      <div class="nums"><label><span>Salario</span><input class="nm" inputmode="decimal" value="${f.monto}"></label><label><span>Bono</span><input class="nb" inputmode="decimal" value="${f.bono || ''}"></label><label><span>Deducción</span><input class="nd" inputmode="decimal" value="${f.deduccion || ''}"></label></div></div>`).join('')
        : '<p class="muted">No hay empleados activos.</p>'}</div>
    <div class="total"><span>Total</span><span id="ntotal"></span></div>
    ${footer(n.id, n.id ? '<button type="button" class="btn" data-act="print-nomina">Recibos</button>' : '')}`];
  },
  notas(n) {
    const numero = n.numero || (Math.max(0, ...D.notas.map(x => x.numero)) + 1);
    const items = (n.items && n.items.length) ? n.items : [{ desc: '', cant: 1, precio: '' }];
    return [`Nota de entrega N° ${String(numero).padStart(4, '0')}`, `
    <input type="hidden" name="numero" value="${numero}">
    <div class="two"><label class="l">Cliente<select name="clienteId" required>${clienteOpts(n.clienteId)}</select></label><label class="l">Fecha<input type="date" name="fecha" value="${n.fecha || hoy()}" required></label></div>
    <div class="two"><label class="l">Moneda<select name="moneda" data-moneda-nota>${opts(MONEDAS, n.moneda || 'USD')}</select></label><label class="l">Estado<select name="estado">${opts([['pendiente', 'Por entregar'], ['entregada', 'Entregada'], ['cobrada', 'Cobrada']], n.estado || 'pendiente')}</select></label></div>
    <div><div class="item muted" style="font-size:12px"><span>Descripción</span><span>Cant.</span><span>Precio</span><span></span></div>
    <div class="items" id="items">${items.map(itemRow).join('')}</div>
    <button type="button" class="btn sm" data-act="add-item" style="margin-top:8px">+ Agregar línea</button></div>
    <div class="total"><span>Total</span><span id="ntotal"></span></div>
    <label class="l">Observaciones<textarea name="observaciones">${esc(n.observaciones)}</textarea></label>
    ${footer(n.id, n.id ? `<button type="button" class="btn" data-act="print-nota">PDF</button><button type="button" class="btn" data-act="wa-nota">WhatsApp</button>${!n.movId ? '<button type="button" class="btn" data-act="cobrar-nota">Registrar cobro</button>' : ''}` : '')}`];
  }
};
const itemRow = i => `<div class="item"><input class="id" value="${esc(i.desc)}" placeholder="Producto o servicio" aria-label="Descripción"><input class="ic" inputmode="decimal" value="${i.cant}" aria-label="Cantidad"><input class="ip" inputmode="decimal" value="${i.precio}" aria-label="Precio"><button type="button" class="x" data-act="del-item" aria-label="Quitar línea">×</button></div>`;

let edit = null; // { col, rec }
function openForm(col, id, preset = {}) {
  const rec = id ? structuredClone(byId(col, id)) : Object.assign({}, preset);
  edit = { col, rec };
  const [titulo, cuerpo] = F[col](rec);
  const dlg = $('#dlg');
  dlg.innerHTML = `<div class="hd"><h3>${esc(titulo)}</h3><button class="close" type="button" data-act="cerrar" aria-label="Cerrar">×</button></div><form class="bd f" data-form="rec" novalidate>${cuerpo}</form>`;
  if (!dlg.open) dlg.showModal();
  recalc();
  const af = $('[autofocus]', dlg); if (af && matchMedia('(min-width:700px)').matches) af.focus(); else $('.close', dlg).focus();
}
function closeForm() { $('#dlg').close(); edit = null; }
function recalc() {
  const dlg = $('#dlg'); const out = $('#ntotal', dlg); if (!out) return;
  const mon = $('[name=moneda]', dlg).value;
  if (edit.col === 'notas') out.textContent = fmt(sum($$('.item', $('#items', dlg)).map(r => num($('.ic', r).value) * num($('.ip', r).value))), mon);
  else out.textContent = fmt(sum($$('.prow', dlg).filter(r => $('.inc', r).checked).map(r => num($('.nm', r).value) + num($('.nb', r).value) - num($('.nd', r).value))), mon);
}

function guardar(form) {
  const { col, rec } = edit;
  for (const el of $$('[required]', form)) if (!el.value.trim()) { el.focus(); el.setCustomValidity('Completa este campo'); el.reportValidity(); return; }
  const fd = Object.fromEntries(new FormData(form));
  const r = Object.assign(rec, fd);
  if (!r.id) r.id = uid();
  if ('monto' in fd) r.monto = num(fd.monto);
  if ('tasa' in fd) r.tasa = r.moneda === 'VES' ? num(fd.tasa) : 0;
  if (col === 'movimientos' && !(r.monto > 0)) return invalid(form, 'monto', 'Escribe un monto mayor que cero');
  if (col === 'pendientes') r.hecho = !!fd.hecho;
  if (col === 'empleados') { r.activo = !!fd.activo; r.salario = num(fd.salario); }
  if (col === 'notas') {
    r.numero = parseInt(fd.numero, 10);
    r.items = $$('.item', $('#items', form)).map(row => ({ desc: $('.id', row).value.trim(), cant: num($('.ic', row).value), precio: num($('.ip', row).value) })).filter(i => i.desc || i.precio);
    if (!r.items.length) { $('#items .id', form).focus(); return; }
    if (r.movId) { const m = byId('movimientos', r.movId); if (m) put('movimientos', Object.assign(m, { monto: notaTotal(r), moneda: r.moneda, fecha: m.fecha })); }
  }
  if (col === 'nominas') {
    r.pagos = $$('.prow', form).map(row => ({ empleadoId: row.dataset.emp, nombre: row.dataset.nombre, incluir: $('.inc', row).checked, monto: num($('.nm', row).value), bono: num($('.nb', row).value), deduccion: num($('.nd', row).value) })).filter(p => p.incluir);
    if (!r.pagos.length) return alert('Incluye al menos a un empleado.');
    r.monto = sum(r.pagos.map(p => p.monto + p.bono - p.deduccion));
    r.movId = r.movId || uid();
    const m = byId('movimientos', r.movId) || { id: r.movId };
    put('movimientos', Object.assign(m, { tipo: 'gasto', categoria: 'Nómina', fecha: r.fecha, monto: r.monto, moneda: r.moneda, tasa: r.tasa, descripcion: 'Nómina ' + r.periodo, nominaId: r.id }));
  }
  put(col, r);
  closeForm(); commit();
}
function invalid(form, name, msg) { const el = form.elements[name]; el.setCustomValidity(msg); el.reportValidity(); el.focus(); }

function eliminar() {
  const { col, rec } = edit;
  const nombre = rec.nombre || rec.titulo || rec.descripcion || rec.periodo || (rec.numero ? 'nota N° ' + rec.numero : 'este registro');
  if (!confirm(`¿Eliminar "${nombre}"? No se puede deshacer.`)) return;
  if (col === 'nominas' && rec.movId) del('movimientos', rec.movId);
  del(col, rec.id);
  closeForm(); commit();
}

function toggle(id) {
  const p = byId('pendientes', id); if (!p) return;
  p.hecho = !p.hecho; put('pendientes', p);
  if (p.hecho && p.tipo !== 'tarea' && num(p.monto) > 0 && !p.movId &&
    confirm(`¿Registrar ${p.tipo === 'cobro' ? 'el ingreso' : 'el gasto'} de ${fmt(num(p.monto), p.moneda)} en Movimientos?`)) {
    p.movId = uid();
    put('movimientos', { id: p.movId, tipo: p.tipo === 'cobro' ? 'ingreso' : 'gasto', fecha: hoy(), monto: num(p.monto), moneda: p.moneda, tasa: p.moneda === 'VES' ? tasaHoy() : 0, descripcion: p.titulo, clienteId: p.clienteId || '', categoria: '' });
    put('pendientes', p);
  }
  commit();
}

/* ============ impresión ============ */
function imprimir(html) {
  $('#print').innerHTML = html;
  const t = document.title; document.title = $('#print').dataset.name || t;
  setTimeout(() => { window.print(); document.title = t; }, 50);
}
function encabezado(titulo, sub) {
  const n = D.ajustes.negocio;
  return `<div class="dh"><div><h1>${esc(n.nombre)}</h1><div>${esc([n.rif && 'RIF ' + n.rif, n.telefono, n.email].filter(Boolean).join(' · '))}</div><div>${esc(n.direccion)}</div></div><div><h2>${titulo}</h2><div style="text-align:right">${sub}</div></div></div>`;
}
function printNota(n) {
  const c = byId('clientes', n.clienteId) || {};
  $('#print').dataset.name = `Nota de entrega ${String(n.numero).padStart(4, '0')} - ${c.nombre || ''}`;
  imprimir(`<div class="doc">${encabezado(`NOTA DE ENTREGA<br>N° ${String(n.numero).padStart(4, '0')}`, fFecha(n.fecha))}
  <div><b>Cliente:</b> ${esc(c.nombre)}${c.rif ? ' · ' + esc(c.rif) : ''}<br>${c.direccion ? esc(c.direccion) + '<br>' : ''}${esc([c.telefono, c.email].filter(Boolean).join(' · '))}</div>
  <table><thead><tr><th>Descripción</th><th class="n">Cant.</th><th class="n">Precio</th><th class="n">Total</th></tr></thead><tbody>
  ${n.items.map(i => `<tr><td>${esc(i.desc)}</td><td class="n">${NF.format(i.cant)}</td><td class="n">${fmt(i.precio, n.moneda)}</td><td class="n">${fmt(i.cant * i.precio, n.moneda)}</td></tr>`).join('')}
  </tbody><tfoot><tr><th colspan="3" class="n">TOTAL</th><th class="n">${fmt(notaTotal(n), n.moneda)}</th></tr></tfoot></table>
  ${n.observaciones ? `<p><b>Observaciones:</b> ${esc(n.observaciones)}</p>` : ''}
  <div class="sig"><div>Entregado por</div><div>Recibido por (nombre, C.I. y firma)</div></div></div>`);
}
function printNomina(n) {
  $('#print').dataset.name = 'Recibos ' + n.periodo;
  imprimir(`<div class="doc">${n.pagos.map(p => {
    const e = byId('empleados', p.empleadoId) || {};
    return `<div class="rec">${encabezado('RECIBO DE PAGO', esc(n.periodo) + '<br>' + fFecha(n.fecha))}
    <div><b>Trabajador:</b> ${esc(p.nombre)}${e.cedula ? ' · C.I. ' + esc(e.cedula) : ''}${e.cargo ? ' · ' + esc(e.cargo) : ''}</div>
    <table><tbody><tr><td>Salario</td><td class="n">${fmt(p.monto, n.moneda)}</td></tr>${p.bono ? `<tr><td>Bono</td><td class="n">${fmt(p.bono, n.moneda)}</td></tr>` : ''}${p.deduccion ? `<tr><td>Deducción</td><td class="n">− ${fmt(p.deduccion, n.moneda)}</td></tr>` : ''}
    <tr><th>Neto a pagar</th><th class="n">${fmt(p.monto + p.bono - p.deduccion, n.moneda)}</th></tr></tbody></table>
    <div class="sig" style="margin-top:36px"><div>Pagado por</div><div>Recibí conforme</div></div></div>`;
  }).join('')}</div>`);
}

/* ============ respaldo ============ */
function descargar(nombre, contenido, tipo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportCSV() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const filas = [['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Cliente', 'Método', 'Monto', 'Moneda', 'Tasa', 'Monto USD']]
    .concat(D.movimientos.slice().sort((a, b) => a.fecha > b.fecha ? 1 : -1).map(m => [m.fecha, m.tipo, m.descripcion, m.categoria, clienteNombre(m.clienteId), m.metodo, NF.format(num(m.monto)), m.moneda, m.tasa || '', NF.format(toUSD(m))]));
  descargar(`movimientos-${hoy()}.csv`, '﻿' + filas.map(f => f.map(q).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}

/* ============ eventos ============ */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-toggle],[data-new],[data-edit],[data-act],[data-ui]');
  if (!t) return;
  if (t.dataset.toggle) { e.stopPropagation(); return toggle(t.dataset.toggle); }
  if (t.dataset.new) return openForm(t.dataset.new);
  if (t.dataset.edit) { const [c, id] = t.dataset.edit.split(':'); if (c === 'movimientos' && $('#dlg').open) closeForm(); return openForm(c, id); }
  if (t.dataset.ui && t.tagName === 'BUTTON') {
    if (t.dataset.ui === 'reset') { ui.q = ''; ui.tipo = 'todos'; } else ui[t.dataset.ui] = t.dataset.v;
    return render();
  }
  const a = t.dataset.act;
  if (a === 'cerrar') closeForm();
  else if (a === 'eliminar') eliminar();
  else if (a === 'add-item') { $('#items').insertAdjacentHTML('beforeend', itemRow({ desc: '', cant: 1, precio: '' })); $('#items .item:last-child .id').focus(); }
  else if (a === 'del-item') { if ($$('#items .item').length > 1) t.closest('.item').remove(); recalc(); }
  else if (a === 'print-nota') printNota(edit.rec);
  else if (a === 'print-nomina') printNomina(edit.rec);
  else if (a === 'wa-nota') {
    const n = edit.rec, c = byId('clientes', n.clienteId) || {};
    const txt = `*${D.ajustes.negocio.nombre}*\nNota de entrega N° ${String(n.numero).padStart(4, '0')} · ${fFecha(n.fecha)}\n\n${n.items.map(i => `• ${i.desc} x${NF.format(i.cant)}: ${fmt(i.cant * i.precio, n.moneda)}`).join('\n')}\n\n*Total: ${fmt(notaTotal(n), n.moneda)}*`;
    const tel = (c.telefono || '').replace(/\D/g, '').replace(/^0/, '58');
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
  }
  else if (a === 'cobrar-nota') {
    const n = edit.rec;
    if (!confirm(`¿Registrar un ingreso de ${fmt(notaTotal(n), n.moneda)} y marcar la nota como cobrada?`)) return;
    n.movId = uid(); n.estado = 'cobrada';
    put('movimientos', { id: n.movId, tipo: 'ingreso', fecha: hoy(), monto: notaTotal(n), moneda: n.moneda, tasa: n.moneda === 'VES' ? tasaHoy() : 0, descripcion: 'Nota de entrega N° ' + String(n.numero).padStart(4, '0'), clienteId: n.clienteId, categoria: '', notaId: n.id });
    put('notas', n); closeForm(); commit();
  }
  else if (a === 'bcv') {
    t.disabled = true; t.textContent = 'Consultando…';
    try {
      const r = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { cache: 'no-store' });
      const j = await r.json();
      if (!j.promedio) throw 0;
      const f = t.closest('form'); f.valor.value = j.promedio; f.fecha.value = (j.fechaActualizacion || hoy()).slice(0, 10);
      t.textContent = 'Tasa cargada, guárdala';
    } catch (err) { t.textContent = 'No se pudo consultar, escríbela a mano'; }
    t.disabled = false;
  }
  else if (a === 'desconectar') {
    if (!confirm('¿Desconectar GitHub en este dispositivo? Tus datos siguen en el repositorio y en este dispositivo.')) return;
    cfg = { owner: '', repo: '', path: 'datos.json', token: '' }; store.set('am_cfg', cfg); setStatus('local'); render();
  }
  else if (a === 'csv') exportCSV();
  else if (a === 'json') descargar(`respaldo-negocio-${hoy()}.json`, JSON.stringify(D, null, 1), 'application/json');
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.ui === 'mes') { ui.mes = t.value || mesActual(); render(); }
  if (t.matches('[data-moneda]')) { const l = $('[data-tasa]', t.closest('form')); if (l) l.hidden = t.value !== 'VES'; recalc(); }
  if (t.matches('[data-moneda-nota], .inc')) recalc();
  if (t.matches('[name=tipo][type=radio]') && edit) { const f = t.closest('form'); Object.assign(edit.rec, Object.fromEntries(new FormData(f))); openForm.call(null, edit.col, null, edit.rec); }
  if (t.dataset.act === 'importar' && t.files[0]) {
    try {
      const x = normalize(JSON.parse(await t.files[0].text()));
      if (!confirm(`El respaldo tiene ${x.movimientos.length} movimientos y ${x.clientes.length} clientes. Se combinará con tus datos actuales. ¿Continuar?`)) return;
      D = merge(D, x); commit();
    } catch (err) { alert('Ese archivo no es un respaldo válido.'); }
    t.value = '';
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  t.setCustomValidity?.('');
  if (t.dataset.ui === 'q') { ui.q = t.value; clearTimeout(render.q); render.q = setTimeout(render, 150); }
  if (t.closest('#dlg') && t.matches('.nm,.nb,.nd,.ic,.ip')) recalc();
});
document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, k = f.dataset.form;
  if (k === 'rec') return guardar(f);
  const fd = Object.fromEntries(new FormData(f));
  if (k === 'tasa') { D.ajustes.tasa = { valor: num(fd.valor), fecha: fd.fecha }; D.ajustes.updatedAt = now(); commit(); }
  if (k === 'negocio') { D.ajustes.negocio = fd; D.ajustes.updatedAt = now(); commit(); }
  if (k === 'github') {
    cfg = { owner: fd.owner.trim(), repo: fd.repo.trim(), token: fd.token.trim(), path: fd.path.trim() || 'datos.json' };
    store.set('am_cfg', cfg); sync().then(render);
  }
});
$('#dlg').addEventListener('close', () => { if (!$('#dlg').open) edit = null; });
$('#dlg').addEventListener('click', e => { if (e.target.id === 'dlg') closeForm(); });
$('#sync').addEventListener('click', () => { if (!configured()) location.hash = '#/ajustes'; else if ($('#sync').dataset.s === 'error') { location.hash = '#/ajustes'; } else sync(); });
window.addEventListener('hashchange', () => { ui.q = ''; if ($('#dlg').open) closeForm(); render(); scrollTo(0, 0); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
window.addEventListener('online', sync);
window.addEventListener('afterprint', () => { $('#print').innerHTML = ''; });

render();
sync();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
