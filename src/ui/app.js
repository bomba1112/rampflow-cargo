// UI layer. Reads only through core/selectors, writes only through core commands (store.run).
// Replaceable: a Flutter UI would call the same core logic ported to Dart.

import { openStore } from '../core/store.js';
import { seedDemo } from '../core/seed.js';
import { T, ULD_STATUS, LOCATION, undoneIds } from '../core/model.js';
import * as C from '../core/commands.js';
import * as Q from '../core/selectors.js';
import { pickStorage } from '../web/storage.js';
import { S, t, setLang, getLang } from './strings.js';

const TZ = 'Asia/Baku';
const PREF_KEY = 'rampflow.ui.v1';

/* ---------- helpers ---------- */
function fmtT(ms) {
  try {
    return new Intl.DateTimeFormat(S.locale, { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(ms);
  } catch (e) {
    const d = new Date(ms);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
}
function fmtD(ms) {
  try {
    return new Intl.DateTimeFormat(S.locale, { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(ms);
  } catch (e) {
    return new Date(ms).toLocaleDateString();
  }
}
function fmtDur(ms) {
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? h + ' ' + S.units.h + ' ' + ('0' + (m % 60)).slice(-2) + ' ' + S.units.min : m + ' ' + S.units.min;
}
function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n) => ('0' + n).slice(-2);
  return p(Math.floor(s / 3600)) + ':' + p(Math.floor((s % 3600) / 60)) + ':' + p(s % 60);
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const $ = (id) => document.getElementById(id);
function bakuParts(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms).split('-').map(Number);
}
/** "HH:MM" in Baku time on the same Baku date as `baseMs`. Baku is UTC+4 all year. */
function parseBaku(baseMs, hhmm) {
  const [y, m, d] = bakuParts(baseMs);
  const [h, mi] = hhmm.split(':').map(Number);
  return Date.UTC(y, m - 1, d, h - 4, mi);
}

const ICON = {
  flights: '<path d="M2 16l20-7-9 13-2-6-9-0z"/><path d="M11 16l-1 5"/>',
  lir: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16M15 4v16"/>',
  dollies: '<rect x="3" y="8" width="18" height="6" rx="1"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  load: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
const ic = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
const TAB_ORDER = ['flights', 'lir', 'dollies', 'search', 'load'];

/* ---------- state ---------- */
let store;
let storageKind = 'memory';
let ui = { tab: 'flights', flightId: null, sheet: null, q: '', logAll: false, pending: null };
let toastTimer = null;

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    if (p.tab && TAB_ORDER.includes(p.tab)) ui.tab = p.tab;
    if (p.flightId) ui.flightId = p.flightId;
  } catch (e) {
    /* prefs are a convenience only */
  }
}
function savePrefs() {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({ tab: ui.tab, flightId: ui.flightId }));
  } catch (e) {
    /* ignore */
  }
}
const st = () => store.getState();
function curFlight() {
  const s = st();
  if (!ui.flightId || !s.flights[ui.flightId]) {
    const first = Object.values(s.flights).sort((a, b) => a.seq - b.seq)[0];
    ui.flightId = first ? first.id : null;
  }
  return ui.flightId ? s.flights[ui.flightId] : null;
}

/* ---------- describing events (for logs and history) ---------- */
function dollyText(ref) {
  const u = Q.dollyUnitOf(st(), ref);
  return u ? u.label + (u.dupIndex > 1 ? ` (${u.dupIndex})` : '') : '?';
}
const uldNo = (id) => (st().ulds[id] ? st().ulds[id].number : '?');

function describe(ev) {
  const p = ev.payload || {};
  switch (ev.eventType) {
    case T.FLIGHT_CREATED: return t(S.log.FLIGHT_CREATED, { number: p.number });
    case T.LIR_LOADED: return t(S.log.LIR_LOADED, { n: p.positions.filter((x) => x.uld).length });
    case T.DOLLY_GROUP_CREATED: return t(S.log.DOLLY_GROUP_CREATED, { number: p.number }) + (p.dupIndex > 1 ? ` (${p.dupIndex})` : '');
    case T.SINGLE_DOLLY_CREATED: return t(S.log.SINGLE_DOLLY_CREATED, { number: p.number });
    case T.ULD_LINKED: return t(S.log.ULD_LINKED, { uld: uldNo(p.uldId), label: dollyText(p.dolly) });
    case T.ULD_UNLINKED: return t(p.reason === 'MOVE' ? S.log.ULD_UNLINKED_MOVE : S.log.ULD_UNLINKED, { uld: uldNo(p.uldId), label: dollyText(p.dolly) });
    case T.ULD_STATUS_CHANGED:
      if (p.status === ULD_STATUS.PRESENTED) return t(S.log.ULD_PRESENTED, { uld: uldNo(p.uldId), label: dollyText(p.fromDolly) });
      return t(S.log.ULD_STATUS, { uld: uldNo(p.uldId), status: S.uldStatus[p.status] || p.status });
    case T.DOLLY_DETACHED: return t(S.log.DOLLY_DETACHED, { label: dollyText(p.dolly) });
    case T.DOLLY_REATTACHED: return t(S.log.DOLLY_REATTACHED, { label: dollyText(p.dolly) });
    case T.LOCATION_RECORDED: {
      const g = st().groups[p.entityId] || st().singles[p.entityId];
      const number = g ? g.number : '?';
      return p.label === LOCATION.UNKNOWN ? t(S.log.LOC_UNKNOWN, { number }) : t(S.log.LOC, { number, place: S.loc[p.label] });
    }
    case T.LOADING_STARTED: return S.log.LOADING_STARTED;
    case T.LOADING_ENDED: return S.log.LOADING_ENDED;
    case T.LOADING_TIME_CORRECTED:
      return t(S.log.LOADING_TIME_CORRECTED, { what: p.field === 'START' ? S.load.start : S.load.end, old: fmtT(p.oldValue), new: fmtT(p.newValue), reason: p.reason });
    case T.ACTION_UNDONE: return S.log.ACTION_UNDONE;
    default: return ev.eventType;
  }
}

function flightOf(ev, byId) {
  const p = ev.payload || {};
  if (p.flightId) return p.flightId;
  const s = st();
  if (p.uldId && s.ulds[p.uldId]) return s.ulds[p.uldId].flightId;
  if (p.dolly) {
    const u = Q.dollyUnitOf(s, p.dolly);
    return u ? u.flightId : null;
  }
  if (p.entityId) {
    const g = s.groups[p.entityId] || s.singles[p.entityId];
    return g ? g.flightId : null;
  }
  if (p.groupId && s.groups[p.groupId]) return s.groups[p.groupId].flightId;
  if (ev.eventType === T.ACTION_UNDONE) {
    const first = byId.get((p.eventIds || [])[0]);
    return first ? flightOf(first, byId) : null;
  }
  return null;
}

function logItems(flightId, onlyUld) {
  const evs = store.getEvents();
  const byId = new Map(evs.map((e) => [e.eventId, e]));
  const undone = undoneIds(evs);
  return evs
    .filter((e) => flightOf(e, byId) === flightId)
    .filter((e) => !onlyUld || (e.payload && e.payload.uldId === onlyUld && e.eventType !== T.ACTION_UNDONE))
    .filter((e) => !onlyUld || !undone.has(e.eventId))
    .map((e) => ({ at: e.occurredAt, text: describe(e), undone: undone.has(e.eventId) }))
    .sort((a, b) => b.at - a.at);
}
function logHtml(items) {
  return (
    '<ul class="log card" style="padding:4px 12px">' +
    items.map((x) => `<li class="${x.undone ? 'undone' : ''}"><time>${fmtT(x.at)}</time><div>${esc(x.text)}${x.undone ? `<small>${S.log.undone}</small>` : ''}</div></li>`).join('') +
    '</ul>'
  );
}

/* ---------- small renderers ---------- */
function statusChip(status) {
  const map = {
    UNKNOWN: ['c-none', S.uldStatus.UNKNOWN],
    ON_DOLLY: ['c-dolly', S.uldStatus.ON_DOLLY],
    PRESENTED_TO_HILOADER: ['c-pres', S.uldStatus.PRESENTED_TO_HILOADER],
    REMOVED_FROM_DOLLY: ['c-off', S.uldStatus.REMOVED_FROM_DOLLY],
    LOADED_CONFIRMED: ['c-load', S.uldStatus.LOADED_CONFIRMED],
  };
  const [c, txt] = map[status] || ['c-none', status];
  return `<span class="chip ${c}">${esc(txt)}</span>`;
}
function locText(loc) {
  if (loc.state === 'KNOWN') return { cls: '', text: t(S.locKnown, { place: S.loc[loc.label], time: fmtT(loc.at) }) };
  if (loc.state === 'UNKNOWN') {
    let text = t(S.locUnknownMoved, { time: fmtT(loc.at) });
    if (loc.lastKnown) text += ' ' + t(S.locLastKnown, { place: S.loc[loc.lastKnown.label], time: fmtT(loc.lastKnown.at) });
    return { cls: 'unk', text };
  }
  return { cls: 'unk', text: S.locUnknown };
}
const locHtml = (loc) => {
  const x = locText(loc);
  return `<div class="loc ${x.cls}">${esc(x.text)}</div>`;
};
const shortUld = (n) => String(n).replace(/^[A-Z]{3}/, '');
const dupSuffix = (n) => (n > 1 ? ' ' + t(S.dollies.dupTag, { n }) : '');

/* ---------- views ---------- */
function viewFlights() {
  const s = st();
  const flights = Object.values(s.flights).sort((a, b) => a.seq - b.seq);
  let h = `<p class="hint">${S.flights.hint}</p>`;
  if (storageKind === 'memory') h += `<div class="warn">${S.sheet.storageMem}</div>`;
  for (const f of flights) {
    const c = Q.counts(s, f.id);
    const cls = f.status === 'LOADING' ? 'c-run' : f.status === 'DONE' ? 'c-done' : 'c-plan';
    h += `<button class="fcard ${f.id === ui.flightId ? 'sel' : ''}" data-act="openFlight" data-id="${esc(f.id)}">
      <span class="top"><span class="no">${esc(f.number)}</span><span class="chip ${cls}">${S.flightStatus[f.status]}</span></span>
      <div class="meta">${t(S.flights.stand, { stand: esc(f.stand) })} · ${esc(f.aircraftType)} · ${fmtD(f.date)}</div>
      <div class="cnt">${t(S.flights.uldCount, c)}${f.lir ? ' · ' + t(S.lir.edno, { n: f.lir.edno }) : ''}</div>
      <div class="open"><span class="btn ${f.id === ui.flightId ? 'primary' : ''} sm">${f.id === ui.flightId ? S.flights.selected + ' · ' : ''}${S.flights.open}</span></div>
    </button>`;
  }
  return h;
}

function lirCellHtml(flightId, code) {
  const cell = Q.lirCell(st(), flightId, code);
  if (cell.empty) {
    return `<div class="lc empty"><span class="code">${esc(code)}</span><span class="top"></span><span class="uld">${S.lir.emptyPos}</span><span class="bot"></span></div>`;
  }
  const v = cell.view;
  const cls = v.status === ULD_STATUS.ON_DOLLY ? 'on' : v.status === ULD_STATUS.PRESENTED || v.status === ULD_STATUS.LOADED_CONFIRMED ? 'pres' : 'unk';
  return `<button class="lc ${cls}" data-act="uld" data-id="${esc(v.id)}">
    <span class="code">${esc(code)}</span><span class="top">${esc(cell.top)}</span>
    <span class="uld">${esc(shortUld(v.number))}</span><span class="bot">${esc(cell.bottom)}</span></button>`;
}

function viewLir(f) {
  if (!f.lir) return `<div class="card muted">${S.lir.noLir}</div>`;
  const c = Q.counts(st(), f.id);
  let h = `<div class="sumline"><span class="chip c-dolly">${t(S.lir.summary, { a: c.onDolly, b: c.presented, c: c.noDolly })}</span><span class="chip c-none">${t(S.lir.edno, { n: f.lir.edno })} · ${esc((f.lir.layout.key && S.layout.titles[f.lir.layout.key]) || f.lir.layout.title)}</span></div>`;
  h += `<p class="legend">${S.lir.legend}</p>`;
  for (const row of f.lir.layout.rows) {
    h += `<div class="lr"><h3>${esc((row.key && S.layout.rows[row.key]) || row.name)}</h3><div class="lrow">${row.codes.map((code) => lirCellHtml(f.id, code)).join('')}</div></div>`;
  }
  return h;
}

function unitCellHtml(u) {
  const s = st();
  const single = u.kind === 'single';
  const uld = u.linkedUldId ? s.ulds[u.linkedUldId] : null;
  let cls;
  let body;
  if (u.detached) {
    cls = 'det';
    body = `<span class="cl">${esc(u.label)}</span><span class="cu">${S.dollies.detached}</span>`;
  } else if (uld) {
    cls = 'occ';
    body = `<span class="cl">${esc(u.label)}</span><span class="cu">${esc(shortUld(uld.number))}</span><span class="cs">→ ${esc(uld.positionCode)}</span>`;
  } else if (u.lastUldId) {
    cls = 'gone';
    body = `<span class="cl">${esc(u.label)}</span><span class="cu">${esc(shortUld(uldNo(u.lastUldId)))}</span><span class="cs">${S.dollies.given}</span>`;
  } else {
    cls = 'empty';
    body = `<span class="cl">${esc(u.label)}</span><span class="cu">${S.dollies.empty}</span>`;
  }
  return `<button class="cell ${cls} ${single ? 'one' : ''}" data-act="dslot" data-rk="${u.kind}" data-ri="${esc(u.id)}">${body}</button>`;
}

function viewDollies(f) {
  let h = `<div class="two"><button class="bigtile y" data-act="newDolly" data-kind="STANDARD_4"><span class="num">4</span><span class="lbl">${S.dollies.four}</span><small>${S.dollies.fourSub}</small></button>
  <button class="bigtile" data-act="newDolly" data-kind="SINGLE_20FT"><span class="num">20 ft</span><span class="lbl">${S.dollies.one}</span><small>${S.dollies.oneSub}</small></button></div>
  <p class="hint">${S.dollies.hint}</p>`;
  const groups = Q.groupsView(st(), f.id);
  if (!groups.length) h += `<div class="card muted">${S.dollies.none}</div>`;
  for (const g of groups) {
    const four = g.kind === 'STANDARD_4';
    h += `<div class="card"><div class="gh"><div class="gt">${four ? t(S.dollies.group, { number: esc(g.number) }) : t(S.dollies.single, { number: esc(g.number) })}${esc(dupSuffix(g.dupIndex))}</div><small>${four ? S.dollies.fourLabel : S.dollies.singleLabel}</small></div>
      <div class="strip ${four ? '' : 'one'}">${four ? `<div class="tug">${S.dollies.tug}</div>` : ''}${g.units.map(unitCellHtml).join('')}</div>
      ${locHtml(g.location)}
      <button class="btn sm ghost" data-act="place" data-kind="${four ? 'group' : 'single'}" data-id="${esc(g.id)}">${S.btn.place}</button></div>`;
  }
  return h;
}

function uldResultHtml(v) {
  let dl = S.search.noDolly;
  if (v.dolly) dl = v.dolly.label + (v.dolly.dupIndex > 1 ? ` (${v.dolly.dupIndex})` : '') + ' · ' + t(S.uld.inGroup, { number: v.dolly.number });
  else if (v.lastDolly) dl = t(S.search.wasOn, { label: v.lastDolly.label });
  return `<button class="res" data-act="uld" data-id="${esc(v.id)}"><div class="rt"><div><b class="n">${esc(v.number)}</b>
    <div class="sub">${t(S.search.lirLine, { pos: `<b>${esc(v.positionCode)}</b>`, weight: v.weight })}</div>
    <div class="sub">${t(S.search.dollyLine, { label: `<b>${esc(dl)}</b>` })}</div></div>${statusChip(v.status)}</div>${v.location ? locHtml(v.location) : ''}</button>`;
}

function searchResultsHtml(f) {
  const s = st();
  const q = ui.q.trim();
  if (!q) {
    const on = Q.uldsOfFlight(s, f.id).filter((v) => v.status === ULD_STATUS.ON_DOLLY);
    let h = `<h2>${t(S.search.onDollies, { n: on.length })}</h2>`;
    h += on.length ? on.map(uldResultHtml).join('') : `<div class="card muted">${S.search.nothing}</div>`;
    return h;
  }
  const r = Q.search(s, f.id, q);
  let h = '';
  if (r.groups.length) {
    h += `<h2>${S.search.groups}</h2>`;
    for (const g of r.groups) {
      const four = g.kind === 'STANDARD_4';
      h += `<button class="res" data-act="goDollies"><div class="rt"><b class="n">${four ? t(S.dollies.group, { number: esc(g.number) }) : t(S.dollies.single, { number: esc(g.number) })}${esc(dupSuffix(g.dupIndex))}</b></div>
        ${g.units.map((u) => `<div class="sub"><b>${esc(u.label)}</b> · ${u.linkedUldId ? esc(uldNo(u.linkedUldId)) : u.lastUldId ? esc(uldNo(u.lastUldId)) + ' ' + S.dollies.given : S.dollies.empty}</div>`).join('')}
        ${locHtml(g.location)}</button>`;
    }
  }
  const emptyPos = r.positions.filter((p) => !p.uld);
  for (const p of emptyPos) h += `<div class="card muted">${t(S.search.emptyPosition, { code: esc(p.code) })}</div>`;
  if (r.ulds.length) h += `<h2>${t(S.search.found, { n: r.ulds.length })}</h2>` + r.ulds.map(uldResultHtml).join('');
  if (!h) h = `<div class="card muted">${S.search.nothing}</div>`;
  return h;
}

function viewSearch(f) {
  return `<input id="q" type="search" autocomplete="off" autocapitalize="characters" placeholder="${esc(S.search.ph)}" value="${esc(ui.q)}">
  <p class="hint">${S.search.hint}</p><div id="sres">${searchResultsHtml(f)}</div>`;
}

function viewLoad(f) {
  const v = Q.loadingView(st(), f.id);
  const c = Q.counts(st(), f.id);
  let h = '';
  if (v.status === 'NOT_STARTED') {
    h += `<div class="card"><div class="muted" style="text-align:center;font-weight:600">${S.load.notStarted}</div></div><button class="btn primary bigbtn" data-act="startLoad">${S.btn.startLoad}</button>`;
  } else if (v.status === 'IN_PROGRESS') {
    h += `<div class="card"><div class="muted" style="text-align:center;font-weight:600">${t(S.load.inProgress, { time: fmtT(v.startedAt) })}</div><div class="timer" id="timer">${fmtClock(Date.now() - v.startedAt)}</div></div><button class="btn dark bigbtn" data-act="endAsk">${S.btn.endLoad}</button>`;
  } else {
    h += `<div class="card"><div class="muted" style="text-align:center;font-weight:600">${S.load.ended}</div><div class="timer">${v.durationMs ? fmtDur(v.durationMs) : '—'}</div></div>`;
  }
  if (v.status !== 'NOT_STARTED') {
    h += `<div class="card"><dl class="kv"><dt>${S.load.start}</dt><dd>${fmtT(v.startedAt)}${v.startCorrected ? `<span class="tag">${S.load.corrected}</span>` : ''}</dd>
      <dt>${S.load.end}</dt><dd>${v.endedAt ? fmtT(v.endedAt) + (v.endCorrected ? `<span class="tag">${S.load.corrected}</span>` : '') : '—'}</dd></dl>
      <div class="two mt"><button class="btn sm ghost" data-act="fixTime" data-field="START">${S.btn.fixStart}</button><button class="btn sm ghost" data-act="fixTime" data-field="END" ${v.endedAt ? '' : 'disabled'}>${S.btn.fixEnd}</button></div></div>`;
  }
  h += `<div class="card"><dl class="kv"><dt>${S.load.onDollies}</dt><dd>${c.onDolly}</dd><dt>${S.load.presented}</dt><dd>${c.presented}</dd><dt>${S.load.noDolly}</dt><dd>${c.noDolly}</dd></dl></div>`;
  const items = logItems(f.id);
  h += `<h2>${S.load.log}<small>${items.length}</small></h2>${logHtml(ui.logAll ? items : items.slice(0, 6))}`;
  if (items.length > 6) h += `<button class="btn sm ghost" data-act="toggleLog">${ui.logAll ? S.btn.showLess : S.btn.showAll}</button>`;
  return h;
}

/* ---------- sheets ---------- */
function sheetUld(id) {
  const v = Q.uldView(st(), id);
  if (!v) return '';
  const idx = v.status === ULD_STATUS.PRESENTED || v.status === ULD_STATUS.LOADED_CONFIRMED ? 2 : v.status === ULD_STATUS.ON_DOLLY ? 1 : 0;
  const names = [S.uld.stepDollyless, S.uld.stepOnDolly, S.uld.stepPresented];
  let h = `<div class="grab"></div><p class="sh-t">${esc(v.number)}</p><p class="sh-s">${t(S.uld.positionLine, { pos: `<b>${esc(v.positionCode)}</b>`, weight: v.weight })} ${statusChip(v.status)}</p>`;
  h += `<div class="steps">${names.map((n, i) => `<div class="${i <= idx ? 'on' : ''}${i === idx ? ' cur' : ''}">${n}</div>`).join('')}</div>`;
  let b = '';
  if (v.status === ULD_STATUS.ON_DOLLY) {
    h += `<div class="card" style="margin-bottom:8px"><b>${t(S.uld.dollyLine, { label: esc(v.dolly.label) })}</b> · ${t(S.uld.inGroup, { number: esc(v.dolly.number) })}${v.location ? locHtml(v.location).replace('class="loc', 'style="margin-top:8px" class="loc') : ''}</div>`;
    b += `<button class="btn primary" data-act="present" data-id="${esc(id)}">${S.btn.present}</button><button class="btn sm" data-act="pickDolly" data-id="${esc(id)}">${S.btn.otherDolly}</button><button class="btn sm ghost" data-act="unlink" data-id="${esc(id)}">${S.btn.unlink}</button>`;
  } else if (v.status === ULD_STATUS.PRESENTED || v.status === ULD_STATUS.LOADED_CONFIRMED) {
    h += `<div class="card" style="margin-bottom:8px">${t(S.uld.presentedAt, { time: fmtT(v.presentedAt), from: v.lastDolly ? t(S.uld.presentedFrom, { label: esc(v.lastDolly.label) }) : '' })}<div class="hint" style="margin-bottom:0">${S.uld.presentedNote}</div></div>`;
    b += `<button class="btn sm" data-act="pickDolly" data-id="${esc(id)}">${S.btn.relink}</button>`;
  } else {
    h += `<div class="card" style="margin-bottom:8px">${S.uld.noDolly}${v.lastDolly ? ' ' + t(S.uld.wasOn, { label: esc(v.lastDolly.label) }) : ''}</div>`;
    b += `<button class="btn primary" data-act="pickDolly" data-id="${esc(id)}">${S.btn.link}</button>`;
  }
  h += `<div class="stack">${b}<button class="btn ghost" data-act="closeSheet">${S.btn.close}</button></div>`;
  const hist = logItems(v.flightId, id);
  if (hist.length) h += `<h2>${S.uld.history}</h2>${logHtml(hist)}`;
  return h;
}

function sheetDolly(ref) {
  const u = Q.dollyUnitOf(st(), ref);
  if (!u) return '';
  const uld = u.linkedUldId ? Q.uldView(st(), u.linkedUldId) : null;
  let h = `<div class="grab"></div><p class="sh-t">${esc(u.label)}${esc(dupSuffix(u.dupIndex))}</p><p class="sh-s">${u.kind === 'slot' ? t(S.sheet.dollySubSlot, { n: u.ordinal, number: esc(u.number) }) : S.sheet.dollySubSingle}</p><div class="stack">`;
  if (u.detached) {
    h += `<div class="card muted">${S.sheet.detachedInfo}</div><button class="btn primary" data-act="reattach" data-rk="${u.kind}" data-ri="${esc(u.id)}">${S.btn.reattach}</button>`;
  } else if (uld) {
    h += `<div class="card"><b>${esc(uld.number)}</b><div class="muted">${t(S.uld.positionLine, { pos: esc(uld.positionCode), weight: uld.weight })}</div></div>
      <button class="btn primary" data-act="present" data-id="${esc(uld.id)}">${S.btn.present}</button>
      <button class="btn sm" data-act="pickUld" data-rk="${u.kind}" data-ri="${esc(u.id)}">${S.btn.otherUld}</button>
      <button class="btn sm ghost" data-act="unlink" data-id="${esc(uld.id)}">${S.btn.unlinkUld}</button>`;
  } else {
    if (u.lastUldId) h += `<div class="card muted">${t(S.sheet.wasGiven, { uld: esc(uldNo(u.lastUldId)) })}</div>`;
    h += `<button class="btn primary" data-act="pickUld" data-rk="${u.kind}" data-ri="${esc(u.id)}">${S.btn.pickUld}</button>`;
    if (u.kind === 'slot') h += `<button class="btn sm ghost" data-act="detach" data-rk="${u.kind}" data-ri="${esc(u.id)}">${S.btn.detach}</button>`;
  }
  return h + `<button class="btn ghost" data-act="closeSheet">${S.btn.close}</button></div>`;
}

function pickUldListHtml(ref, q) {
  const f = curFlight();
  const qq = q.toUpperCase().replace(/\s+/g, '');
  let list = Q.uldsOfFlight(st(), f.id).filter((v) => v.status !== ULD_STATUS.PRESENTED && v.status !== ULD_STATUS.LOADED_CONFIRMED);
  if (qq) list = list.filter((v) => v.number.toUpperCase().includes(qq) || v.positionCode.toUpperCase() === qq);
  const free = list.filter((v) => v.status !== ULD_STATUS.ON_DOLLY);
  const busy = list.filter((v) => v.status === ULD_STATUS.ON_DOLLY);
  const row = (v, act) => `<button class="row" data-act="${act}" data-id="${esc(v.id)}" data-rk="${ref.kind}" data-ri="${esc(ref.id)}"><span class="code">${esc(v.positionCode)}</span><span class="rmain"><b>${esc(v.number)}</b><small>${v.weight} ${S.units.kg}</small></span><span class="rst">${statusChip(v.status)}</span></button>`;
  let h = free.map((v) => row(v, 'doLink')).join('');
  if (busy.length) h += `<p class="hint">${S.sheet.alreadyOn}</p>` + busy.map((v) => row(v, 'doLink')).join('');
  return h || `<div class="card muted">${S.sheet.pickUldNone}</div>`;
}
function sheetPickUld(ref) {
  const u = Q.dollyUnitOf(st(), ref);
  return `<div class="grab"></div><p class="sh-t">${t(S.sheet.pickUldTitle, { label: esc(u.label) })}</p><p class="sh-s">${S.sheet.pickUldSub}</p>
    <input id="pq" type="search" autocomplete="off" autocapitalize="characters" placeholder="${esc(S.sheet.pickUldPh)}"><div id="plist" class="mt">${pickUldListHtml(ref, '')}</div>
    <div class="mt"><button class="btn ghost" data-act="closeSheet">${S.btn.close}</button></div>`;
}

function sheetPickDolly(uldId) {
  const v = Q.uldView(st(), uldId);
  let h = `<div class="grab"></div><p class="sh-t">${esc(v.number)}</p><p class="sh-s">${t(S.sheet.pickDollySub, { pos: esc(v.positionCode) })}</p>`;
  const groups = Q.groupsView(st(), v.flightId);
  if (!groups.length) h += `<div class="card muted">${S.sheet.noDollies}</div>`;
  for (const g of groups) {
    const four = g.kind === 'STANDARD_4';
    h += `<div class="pickgrp"><b>${four ? t(S.dollies.group, { number: esc(g.number) }) : t(S.dollies.single, { number: esc(g.number) })}${esc(dupSuffix(g.dupIndex))}</b><div class="chips mt">${g.units
      .map((u) => {
        if (u.linkedUldId === uldId) return `<button disabled>${esc(u.label)} · ${S.sheet.thisOne}</button>`;
        if (u.detached) return `<button disabled>${esc(u.label)} · ${S.sheet.detachedShort}</button>`;
        if (u.linkedUldId) return `<button disabled>${esc(u.label)} · ${S.sheet.busy}</button>`;
        return `<button data-act="doLink" data-id="${esc(uldId)}" data-rk="${u.kind}" data-ri="${esc(u.id)}">${esc(u.label)}</button>`;
      })
      .join('')}</div></div>`;
  }
  return h + `<div class="stack"><button class="btn sm" data-act="newDolly" data-kind="STANDARD_4" data-then="${esc(uldId)}">${S.btn.newGroup}</button><button class="btn sm" data-act="newDolly" data-kind="SINGLE_20FT" data-then="${esc(uldId)}">${S.btn.newSingle}</button><button class="btn ghost" data-act="closeSheet">${S.btn.close}</button></div>`;
}

function dupExists(kind, number) {
  const f = curFlight();
  const n = C.normalizeNumber(number);
  if (!n || !f) return false;
  const coll = kind === 'STANDARD_4' ? st().groups : st().singles;
  return Object.values(coll).some((g) => g.flightId === f.id && g.number === n);
}
function newDollyPreview(kind, val) {
  if (!val) return `<p class="hint">${S.sheet.typeNumber}</p>`;
  const n = C.normalizeNumber(val);
  if (!n) return `<div class="err">${S.err.INVALID_NUMBER}</div>`;
  let h =
    kind === 'STANDARD_4'
      ? `<div class="prev">${[1, 2, 3, 4].map((i) => `<span>${esc(n)}-${i}</span>`).join('')}</div><p class="hint">${S.sheet.previewHintGroup}</p>`
      : `<div class="prev one"><span>${esc(n)}</span></div><p class="hint">${S.sheet.previewHintSingle}</p>`;
  if (dupExists(kind, n)) h += `<div class="warn">${t(S.sheet.dupWarn, { kind: kind === 'STANDARD_4' ? S.kind.group : S.kind.single, number: esc(n) })}</div>`;
  return h;
}
function sheetNewDolly(sh) {
  const four = sh.kind === 'STANDARD_4';
  const n = C.normalizeNumber(sh.val);
  const dup = n && dupExists(sh.kind, n);
  return `<div class="grab"></div><p class="sh-t">${four ? S.sheet.newGroupTitle : S.sheet.newSingleTitle}</p><p class="sh-s">${four ? S.sheet.newGroupSub : S.sheet.newSingleSub}</p>
    <input id="gnum" type="text" inputmode="numeric" maxlength="8" autocomplete="off" autocapitalize="characters" placeholder="${esc(S.sheet.numberPh)}" value="${esc(sh.val || '')}">
    <div id="gprev">${newDollyPreview(sh.kind, sh.val)}</div>
    <div class="stack mt"><button class="btn primary" id="gok" data-act="createDolly" ${n ? '' : 'disabled'}>${dup ? t(S.btn.createAnother, { number: esc(n) }) : S.btn.create}</button><button class="btn ghost" data-act="closeSheet">${S.btn.cancel}</button></div>`;
}

function sheetPlace(sh) {
  const g = sh.kind === 'group' ? st().groups[sh.id] : st().singles[sh.id];
  const loc = Q.locationOf(st(), sh.kind, sh.id);
  const zones = [LOCATION.NOSE, LOCATION.TAIL, LOCATION.LEFT, LOCATION.RIGHT, LOCATION.OTHER];
  return `<div class="grab"></div><p class="sh-t">${S.sheet.placeTitle}</p><p class="sh-s">${esc(g.number)}</p>${locHtml(loc)}<p class="sh-s">${S.locNote}</p>
    <div class="stack"><b>${S.sheet.placeAsk}</b><div class="chips">${zones.map((z) => `<button class="fchip" data-act="setLoc" data-label="${z}">${S.loc[z]}</button>`).join('')}</div>
    <button class="btn" data-act="setLoc" data-label="${LOCATION.UNKNOWN}">${S.btn.moved}</button><button class="btn ghost" data-act="closeSheet">${S.btn.close}</button></div>`;
}

function confirmText(code, data) {
  switch (code) {
    case 'MOVE_ULD': return t(S.confirm.MOVE_ULD, { from: dollyText(data.from), to: dollyText(data.to) });
    case 'REVERT_PRESENTED': return t(S.confirm.REVERT_PRESENTED, { to: dollyText(data.to) });
    case 'UNLINK_ULD': return t(S.confirm.UNLINK_ULD, { from: dollyText(data.dolly) });
    case 'DUPLICATE_NUMBER': return t(S.confirm.DUPLICATE_NUMBER, { kind: data.kind === 'STANDARD_4' ? S.kind.group : S.kind.single, number: data.number });
    case 'RESET': return S.confirm.RESET;
    default: return code;
  }
}
function sheetConfirm(sh) {
  return `<div class="grab"></div><p class="sh-t">${S.sheet.confirmTitle}</p><p class="sh-s" style="font-size:16px;color:var(--ink)">${esc(confirmText(sh.code, sh.data || {}))}</p>
    <div class="stack"><button class="btn primary" data-act="confirmYes">${S.btn.confirm}</button><button class="btn ghost" data-act="closeSheet">${S.btn.cancel}</button></div>`;
}

function sheetEndAsk() {
  const c = Q.counts(st(), curFlight().id);
  return `<div class="grab"></div><p class="sh-t">${S.sheet.endTitle}</p><p class="sh-s">${c.onDolly ? t(S.sheet.endLeft, { n: c.onDolly }) : S.sheet.endNone}</p>
    <div class="stack"><button class="btn dark" data-act="endLoad">${S.btn.yesEnd}</button><button class="btn ghost" data-act="closeSheet">${S.btn.back}</button></div>`;
}

function sheetTime(sh) {
  const v = Q.loadingView(st(), curFlight().id);
  const old = sh.field === 'START' ? v.startedAt : v.endedAt;
  return `<div class="grab"></div><p class="sh-t">${t(S.sheet.timeTitle, { what: sh.field === 'START' ? S.sheet.start : S.sheet.end })}</p><p class="sh-s">${t(S.sheet.timeSub, { old: fmtT(old) })}</p>
    <input id="tval" type="time" value="${fmtT(old)}"><p class="sh-s mt">${S.sheet.reasonAsk}</p>
    <div class="reasons">${S.sheet.reasons.map((r) => `<button data-act="reason" data-r="${esc(r)}" class="${sh.reason === r ? 'on' : ''}">${esc(r)}</button>`).join('')}</div>
    ${sh.msg ? `<div class="err">${esc(sh.msg)}</div>` : ''}
    <div class="stack mt"><button class="btn primary" data-act="saveTime" ${sh.reason ? '' : 'disabled'}>${S.btn.save}</button><button class="btn ghost" data-act="closeSheet">${S.btn.cancel}</button></div>`;
}

function sheetMenu() {
  return `<div class="grab"></div><p class="sh-t">${S.sheet.menuTitle}</p><p class="sh-s">${S.sheet.about}</p><div class="stack">
    <div class="card" style="margin:0"><b>${S.sheet.lang}</b><div class="chips mt"><button class="fchip ${getLang() === 'az' ? 'on' : ''}" data-act="lang" data-lang="az">Azərbaycanca</button><button class="fchip ${getLang() === 'ru' ? 'on' : ''}" data-act="lang" data-lang="ru">Русский</button></div></div>
    <div class="card muted" style="font-size:14px;margin:0"><b style="color:var(--ink)">${S.sheet.open}</b><br>${S.sheet.openText}</div>
    <button class="btn sm ghost" data-act="resetAsk">${S.btn.reset}</button><button class="btn ghost" data-act="closeSheet">${S.btn.close}</button></div>`;
}

function renderSheet() {
  const sh = ui.sheet;
  const el = $('sheet');
  if (!sh) {
    el.style.display = 'none';
    $('scrim').style.display = 'none';
    el.innerHTML = '';
    return;
  }
  let h = '';
  switch (sh.t) {
    case 'uld': h = sheetUld(sh.id); break;
    case 'dolly': h = sheetDolly(sh.ref); break;
    case 'pickUld': h = sheetPickUld(sh.ref); break;
    case 'pickDolly': h = sheetPickDolly(sh.id); break;
    case 'newDolly': h = sheetNewDolly(sh); break;
    case 'place': h = sheetPlace(sh); break;
    case 'confirm': h = sheetConfirm(sh); break;
    case 'endAsk': h = sheetEndAsk(); break;
    case 'time': h = sheetTime(sh); break;
    case 'menu': h = sheetMenu(); break;
    default: h = '';
  }
  el.innerHTML = `<div class="panel">${h}</div>`;
  el.style.display = 'block';
  $('scrim').style.display = 'block';
}
function openSheet(sh) {
  ui.sheet = sh;
  renderSheet();
  const i = $('gnum') || $('pq');
  if (i) {
    try { i.focus(); } catch (e) { /* ignore */ }
  }
}
function closeSheet() {
  ui.sheet = null;
  ui.pending = null;
  renderSheet();
}

/* ---------- toast ---------- */
function toast(msg, withUndo, bad) {
  const el = $('toast');
  el.className = bad ? 'bad' : '';
  el.innerHTML = `<span>${esc(msg)}</span>${withUndo && store.canUndo() ? `<button data-act="undo">${S.btn.undo}</button>` : ''}`;
  el.style.display = 'flex';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, 7000);
}

/* ---------- render ---------- */
function render() {
  const f = curFlight();
  $('hdr').innerHTML = `<div class="fl"><div class="t1">${f ? esc(f.number) + ' · ' + esc(f.stand) : S.appName}</div><div class="t2"><span class="demo">${S.demo}</span>${f ? `<span>${esc(f.aircraftType)}</span><span>${S.flightStatus[f.status]}</span>` : ''}</div></div><button class="menubtn" data-act="menu" aria-label="${S.btn.menu}">⋮</button>`;
  $('nav').innerHTML = TAB_ORDER.map((k) => `<button class="${ui.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${ic(k)}${S.tabs[k]}</button>`).join('');
  const m = $('main');
  const keep = m.scrollTop;
  let h = '';
  if (ui.tab === 'flights' || !f) h = viewFlights();
  else if (ui.tab === 'lir') h = viewLir(f);
  else if (ui.tab === 'dollies') h = viewDollies(f);
  else if (ui.tab === 'search') h = viewSearch(f);
  else if (ui.tab === 'load') h = viewLoad(f);
  m.innerHTML = h;
  m.scrollTop = keep;
  if (ui.sheet) renderSheet();
}

/* ---------- actions ---------- */
function exec(fn, params, msg) {
  const r = store.run(fn, params);
  if (r.ok) {
    closeSheet();
    toast(msg, true);
    render();
  } else if (r.confirm) {
    ui.pending = { fn, params, msg };
    openSheet({ t: 'confirm', code: r.confirm.code, data: r.confirm.data });
  } else {
    toast(S.err[r.error.code] || r.error.code, false, true);
    render();
  }
  return r;
}
const refOf = (d) => ({ kind: d.rk, id: d.ri });

const A = {
  tab(d) { ui.tab = d.tab; savePrefs(); $('main').scrollTop = 0; render(); },
  openFlight(d) { ui.flightId = d.id; ui.tab = 'lir'; ui.q = ''; savePrefs(); $('main').scrollTop = 0; render(); },
  goDollies() { ui.tab = 'dollies'; savePrefs(); render(); },
  menu() { openSheet({ t: 'menu' }); },
  lang(d) { setLang(d.lang); render(); },
  closeSheet,
  uld(d) { openSheet({ t: 'uld', id: d.id }); },
  dslot(d) { openSheet({ t: 'dolly', ref: refOf(d) }); },
  pickUld(d) { openSheet({ t: 'pickUld', ref: refOf(d) }); },
  pickDolly(d) { openSheet({ t: 'pickDolly', id: d.id }); },
  doLink(d) {
    const ref = refOf(d);
    const label = dollyText(ref);
    exec(C.linkUld, { uldId: d.id, dolly: ref }, t(S.toast.link, { uld: shortUld(uldNo(d.id)), label }));
  },
  present(d) { exec(C.presentUld, { uldId: d.id }, t(S.toast.present, { time: fmtT(Date.now()) })); },
  unlink(d) { exec(C.unlinkUld, { uldId: d.id }, S.toast.unlinked); },
  detach(d) { exec(C.detachDolly, { dolly: refOf(d) }, S.toast.detach); },
  reattach(d) { exec(C.reattachDolly, { dolly: refOf(d) }, S.toast.reattach); },
  confirmYes() {
    const p = ui.pending;
    if (!p) return closeSheet();
    exec(p.fn, { ...p.params, confirmed: true }, p.msg);
  },
  newDolly(d) { openSheet({ t: 'newDolly', kind: d.kind, val: '', then: d.then || null }); },
  createDolly() {
    const sh = ui.sheet;
    const f = curFlight();
    const n = C.normalizeNumber(sh.val);
    if (!n) return;
    const four = sh.kind === 'STANDARD_4';
    const confirmed = dupExists(sh.kind, n); // the sheet already warned about the repeat
    const then = sh.then;
    const r = store.run(four ? C.createDollyGroup : C.createSingleDolly, { flightId: f.id, number: n, confirmed });
    if (!r.ok) { toast((r.error && S.err[r.error.code]) || S.err.generic, false, true); return; }
    const msg = four ? t(S.toast.group, { n }) : t(S.toast.single, { n });
    if (then) { openSheet({ t: 'pickDolly', id: then }); toast(msg, true); render(); return; }
    ui.tab = 'dollies'; savePrefs(); closeSheet(); toast(msg, true); render();
  },
  place(d) { openSheet({ t: 'place', kind: d.kind, id: d.id }); },
  setLoc(d) {
    const sh = ui.sheet;
    const msg = d.label === LOCATION.UNKNOWN ? S.toast.moved : t(S.toast.place, { place: S.loc[d.label] });
    exec(C.recordLocation, { entityKind: sh.kind, entityId: sh.id, label: d.label }, msg);
  },
  startLoad() { exec(C.startLoading, { flightId: curFlight().id }, t(S.toast.start, { time: fmtT(Date.now()) })); },
  endAsk() { openSheet({ t: 'endAsk' }); },
  endLoad() { exec(C.endLoading, { flightId: curFlight().id }, S.toast.end); },
  fixTime(d) { openSheet({ t: 'time', field: d.field, reason: null, msg: null }); },
  reason(d) {
    const v = $('tval') ? $('tval').value : '';
    ui.sheet.reason = d.r;
    renderSheet();
    if ($('tval') && v) $('tval').value = v;
  },
  saveTime() {
    const sh = ui.sheet;
    const f = curFlight();
    const v = Q.loadingView(st(), f.id);
    const old = sh.field === 'START' ? v.startedAt : v.endedAt;
    const hhmm = $('tval').value;
    if (!hhmm || !sh.reason) return;
    const r = store.run(C.correctLoadingTime, { flightId: f.id, field: sh.field, newValue: parseBaku(old, hhmm), reason: sh.reason });
    if (!r.ok) { sh.msg = S.err[r.error.code] || r.error.code; renderSheet(); if ($('tval')) $('tval').value = hhmm; return; }
    closeSheet(); toast(S.toast.fix, true); render();
  },
  toggleLog() { ui.logAll = !ui.logAll; render(); },
  undo() {
    if (store.undoLast()) { toast(S.toast.undone, false); closeSheet(); render(); }
  },
  resetAsk() { ui.pending = { custom: 'reset' }; openSheet({ t: 'confirm', code: 'RESET', data: {} }); },
};
// custom confirmation for destructive reset
const baseConfirm = A.confirmYes;
A.confirmYes = function () {
  if (ui.pending && ui.pending.custom === 'reset') {
    closeSheet();
    store.reset().then(() => {
      seedDemo(store);
      ui.flightId = null; ui.tab = 'flights'; ui.q = '';
      toast(S.toast.reset, false);
      render();
    });
    return;
  }
  baseConfirm();
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.hasAttribute('disabled')) return;
  const fn = A[el.dataset.act];
  if (fn) fn(el.dataset, el, e);
});
$('scrim').addEventListener('click', closeSheet);

document.addEventListener('input', (e) => {
  const el = e.target;
  const f = curFlight();
  if (el.id === 'q') {
    ui.q = el.value;
    $('sres').innerHTML = searchResultsHtml(f);
  } else if (el.id === 'gnum') {
    ui.sheet.val = el.value;
    $('gprev').innerHTML = newDollyPreview(ui.sheet.kind, el.value);
    const n = C.normalizeNumber(el.value);
    const b = $('gok');
    b.disabled = !n;
    b.textContent = n && dupExists(ui.sheet.kind, n) ? t(S.btn.createAnother, { number: n }) : S.btn.create;
  } else if (el.id === 'pq') {
    $('plist').innerHTML = pickUldListHtml(ui.sheet.ref, el.value);
  }
});

setInterval(() => {
  const el = $('timer');
  const f = curFlight();
  if (!el || !f) return;
  const v = Q.loadingView(st(), f.id);
  if (v.status === 'IN_PROGRESS') el.textContent = fmtClock(Date.now() - v.startedAt);
}, 1000);

/* ---------- start ---------- */
async function main() {
  loadPrefs();
  const storage = await pickStorage();
  storageKind = storage.kind || 'memory';
  store = await openStore({ storage });
  if (!Object.keys(store.getState().flights).length) seedDemo(store);
  curFlight();
  render();
  try {
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('./sw.js').catch(() => {});
  } catch (e) {
    /* offline install is optional */
  }
}
main();
