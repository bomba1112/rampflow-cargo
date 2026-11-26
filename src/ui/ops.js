// UI of the turnaround functions: stand check, Chocks, service timers, delays, special cargo,
// loadmaster checklist, shift dashboard, handover report, roles, day/night theme, Online/Offline chip.
// It sits next to app.js and touches nothing of the LIR / telejka logic: app.js gives it a small context (see createOps).
import * as O from '../core/ops.js';
import * as Q from '../core/selectors.js';
import { S, t } from './strings.js';
import { putFile, getFile } from '../web/files.js';

const PREF = 'rampflow.ops.v1';
const SYNC_BASE = 'rampflow.sync.base';
const HOLD_MS = 1200;
const SWIPE_AT = 0.86;

const ROLE_TABS = {
  sv: ['flights', 'lir', 'dollies', 'search', 'load', 'turn'], // the five tabs that were there + the new one at the end
  lm: ['flights', 'lir', 'special', 'ready'],
  ch: ['overview', 'delaysmgr', 'handover'],
};
const NEW_TABS = ['turn', 'special', 'ready', 'overview', 'delaysmgr', 'handover'];
export const OPS_ICONS = {
  turn: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 13l2 2 4-4"/>',
  special: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
  ready: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  overview: '<path d="M4 20V10M10 20V4M16 20v-8M2 20h20"/>',
  delaysmgr: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 3h6"/>',
  handover: '<path d="M4 12h12M12 7l5 5-5 5M20 4v16"/>',
};
const GROUPS = ['cargo', 'load', 'service', 'other'];
const SVC_ORDER = ['unload', 'load', 'fuel', 'cater', 'gse'];

export function createOps(c) {
  let pref = { role: 'sv', theme: 'day' };
  let online = true;
  let hcom = ''; // the shift manager's comment on the handover (kept while the page is redrawn)

  try {
    const p = JSON.parse(localStorage.getItem(PREF) || '{}');
    if (ROLE_TABS[p.role]) pref.role = p.role;
    if (p.theme === 'night' || p.theme === 'day') pref.theme = p.theme;
  } catch (e) {
    /* preferences are a convenience only */
  }
  try { online = navigator.onLine !== false; } catch (e) { /* assume online */ }

  const savePref = () => {
    try { localStorage.setItem(PREF, JSON.stringify(pref)); } catch (e) { /* ignore */ }
  };
  const applyTheme = () => {
    try {
      document.documentElement.setAttribute('data-theme', pref.theme);
      const m = document.querySelector('meta[name=theme-color]');
      if (m) m.setAttribute('content', pref.theme === 'night' ? '#060B11' : '#0B1B2B');
    } catch (e) { /* ignore */ }
  };

  const { esc, fmtT, fmtClock } = c;
  const fl = () => c.curFlight();
  const opsOf = (f) => O.opsOf(c.st(), f.id);
  const svcName = (k) => S.ops.svc[k] || k;
  const codeName = (code) => (S.ops.delay.codes[code] ? S.ops.delay.codes[code][0] : '');
  const flightNo = (id) => (c.st().flights[id] ? c.st().flights[id].number : '?');
  const uldNoAt = (flightId, code) => {
    const p = c.st().positions[`${flightId}:${code}`];
    const u = p && p.uldId ? c.st().ulds[p.uldId] : null;
    return u ? u.number || code : code;
  };

  /* ---------- helpers ---------- */
  function run(fn, params, msg, opt = {}) {
    const f0 = params && params.flightId ? c.st().flights[params.flightId] : null;
    const wasReady = f0 ? !!O.opsOf(c.st(), f0.id).ready : false;
    const r = c.store().run(fn, params);
    if (!r.ok) {
      c.toast((r.error && S.err[r.error.code]) || S.err.generic, false, true);
      c.render();
      return r;
    }
    if (opt.close) c.closeSheet();
    if (f0 && wasReady && !O.opsOf(c.st(), f0.id).ready) c.toast(t(S.ops.toast.unready, { no: f0.number }), true);
    else if (msg) c.toast(msg, true);
    c.render();
    return r;
  }
  const noFlight = () => `<div class="card muted" style="text-align:center;font-weight:600">${S.ops.noFlight}</div>`;
  const whyText = (w) => t(S.ops.ch.why[w.code] || w.code, { name: w.arg ? svcName(w.arg) : '' });
  const slaChip = (f) => {
    const v = O.slaView(c.st(), f, Date.now());
    return `<span class="chip sla lv-${v.level}">${esc(whyText(v.why[0]))}</span>`;
  };
  function stageOf(f) {
    const o = opsOf(f);
    if (o.chocksOff) return 'departed';
    if (o.ready) return 'ready';
    const l = c.st().loading[f.id];
    if (Object.keys(o.services).length || (l && l.startedAt)) return 'service';
    if (o.chocksOn) return 'chocks';
    return 'planned';
  }
  const statusChip = (txt, cls) => `<span class="chip ${cls}">${esc(txt)}</span>`;
  const delayStatusChip = (d) =>
    statusChip(S.ops.delay.status[d.status] || d.status, d.status === 'APPROVED' ? 'c-load' : d.status === 'ESCALATED' ? 'c-pres' : d.status === 'RETURNED' ? 'c-off' : 'c-plan');
  const holdBtn = (act, label, dis, hint, cls = 'dark') =>
    `<button class="btn holdbtn ${cls}" data-hold="${act}" ${dis ? 'disabled' : ''}><span>${esc(label)}</span></button><div class="hint hh">${esc(dis ? hint : S.ops.hold.hint)}</div>`;
  const cycle = (v) => (v === 'ok' ? 'note' : v === 'note' ? null : 'ok');
  const vText = (v) => S.ops.toast.v[v || 'reset'];

  /* ---------- tabs and header ---------- */
  const tabs = () => ROLE_TABS[pref.role];
  const isOpsTab = (k) => NEW_TABS.includes(k);
  const allTabs = () => [...new Set([].concat(...Object.values(ROLE_TABS)))];
  const wide = () => pref.role === 'ch';
  const showFlight = () => pref.role !== 'ch';

  function unsynced() {
    let n = 0;
    try {
      n = c.store().getEvents().length;
      let base = localStorage.getItem(SYNC_BASE);
      if (base == null || Number(base) > n) { base = String(n); localStorage.setItem(SYNC_BASE, base); }
      return Math.max(0, n - Number(base));
    } catch (e) {
      return 0;
    }
  }
  function netChip() {
    const n = unsynced();
    return `<button class="netchip ${online ? 'on' : 'off'}" data-act="netInfo" aria-label="${esc(S.ops.net.queueTitle)}"><i class="dot"></i><span>${online ? S.ops.net.online : S.ops.net.offline}</span>${n ? `<b>${n}</b>` : ''}</button>`;
  }
  const roleChip = () => `<span class="rolechip">${esc(S.ops.role.header[pref.role])}</span>`;

  /* ---------- turn tab (supervisor) ---------- */
  function timerRowHtml(k, v, o, f) {
    const pct = Math.min(100, Math.round((v.ms / v.plan) * 100));
    let right = '';
    let sub = t(S.ops.timers.plan, { n: v.plan / 60000 });
    if (v.state !== 'idle') sub += ' · ' + t(S.ops.timers.startAt, { time: fmtT(v.startAt) });
    if (v.state === 'done') sub += ' · ' + t(S.ops.timers.doneAt, { time: fmtT(v.stopAt) });
    if (k === 'load') {
      right = `<button class="btn sm" data-act="tab" data-tab="load">${S.ops.timers.openLoad}</button>`;
      sub = S.ops.timers.loadLink + ' · ' + sub;
    } else if (v.state === 'idle') {
      right = `<button class="btn sm primary" data-act="svcStart" data-svc="${k}" ${o.chocksOn && !o.chocksOff ? '' : 'disabled'}>${S.ops.timers.start}</button>`;
    } else if (v.state === 'run') {
      right = `<button class="btn sm dark" data-act="svcStop" data-svc="${k}">${S.ops.timers.stop}</button>`;
    }
    return `<div class="trow lv-${v.level} st-${v.state}" data-row="${k}"><div class="tl"><b>${esc(svcName(k))}</b><small>${esc(sub)}</small></div><div class="tm" data-tm="${k}">${v.state === 'idle' ? '--:--:--' : fmtClock(v.ms)}</div><div class="tb">${right}</div><div class="bar"><i style="width:${v.state === 'idle' ? 0 : pct}%"></i></div></div>`;
  }

  function viewTurn(f) {
    if (!f) return noFlight();
    const s = c.st();
    const o = O.opsOf(s, f.id);
    const fodN = Object.keys(o.fod).length;
    const fodNotes = Object.values(o.fod).filter((x) => x === 'note').length;
    const tv = O.timersView(s, f.id, Date.now());
    let h = `<div class="card tcard"><div class="gh"><span class="gt">${esc(f.number)}</span>${slaChip(f)}</div><div class="meta2">${f.stand ? esc(f.stand) + ' · ' : ''}${f.std ? 'STD ' + esc(f.std) + ' · ' : ''}${esc(S.ops.ch.st[stageOf(f)])}</div></div>`;

    h += `<button class="card rowbtn" data-act="fodOpen"><span><b>${esc(f.stand ? t(S.ops.fod.title, { stand: f.stand }) : S.ops.fod.titleNoStand)}</b><small>${fodN}/${O.FOD_ITEMS}${fodNotes ? ' · ! ' + fodNotes : ''}</small></span>${statusChip(fodN === O.FOD_ITEMS ? '✓' : fodN + '/' + O.FOD_ITEMS, fodN === O.FOD_ITEMS ? 'c-load' : 'c-plan')}</button>`;

    h += `<div class="card"><div class="gh"><b>${S.ops.chocks.title}</b><span class="chkst">${o.chocksOn ? t(S.ops.chocks.onAt, { time: fmtT(o.chocksOn) }) : S.ops.chocks.off}${o.chocksOff ? ' · ' + t(S.ops.chocks.offAt, { time: fmtT(o.chocksOff) }) : ''}</span></div><div class="mt">`;
    if (!o.chocksOn) h += holdBtn('chocksOn', S.ops.chocks.btnOn, fodN < O.FOD_ITEMS, S.ops.chocks.needFod, 'primary');
    else if (!o.chocksOff) h += holdBtn('chocksOff', S.ops.chocks.btnOff, !o.ready, S.ops.chocks.needReady);
    else h += `<div class="done-banner">${S.ops.ch.st.departed}</div>`;
    h += `</div></div>`;

    h += `<div class="card"><div class="gh"><b>${S.ops.tabs.ready}</b>${o.ready ? statusChip(t(S.ops.ready.confirmed, { time: fmtT(o.ready) }), 'c-load') : statusChip(S.ops.ready.not, 'c-plan')}</div></div>`;

    h += `<h2>${S.ops.timers.title}</h2>`;
    if (!o.chocksOn) h += `<div class="hint">${S.ops.timers.needChocks}</div>`;
    h += `<div class="card tcol">${SVC_ORDER.map((k) => timerRowHtml(k, tv[k], o, f)).join('')}</div>`;

    const ds = O.delaysOf(s, f.id);
    h += `<h2>${S.ops.tabs.delays}<small>${ds.length}</small></h2><button class="btn" data-act="delayNew">${S.ops.delay.newBtn}</button><div style="height:12px"></div>`;
    if (!ds.length) h += `<div class="hint">${S.ops.delay.none}</div>`;
    for (const d of ds.slice().reverse()) {
      h += `<div class="card drow"><div class="gh"><b>${esc(d.code)} · ${esc(codeName(d.code))}</b>${delayStatusChip(d)}</div><div class="sub2">${t(S.ops.delay.details, { code: fmtT(d.reportedAt), min: d.minutes })}${d.photos ? ' · ' + t(S.ops.delay.photoCount, { n: d.photos }) : ''}</div>${d.note ? `<div class="note2">${esc(d.note)}</div>` : ''}</div>`;
    }
    return h;
  }

  /* ---------- stand check sheet ---------- */
  function checkRows(items, state, act, locked) {
    return `<div class="chklist">${items
      .map((txt, i) => {
        const v = state[i] || null;
        return `<button class="chk ${v || 'none'}" data-act="${act}" data-i="${i}" ${locked ? 'disabled' : ''}><i>${v === 'ok' ? '✓' : v === 'note' ? '!' : '·'}</i><span>${esc(txt)}</span></button>`;
      })
      .join('')}</div>`;
  }
  function sheetFod() {
    const f = fl();
    if (!f) return '';
    const o = opsOf(f);
    const n = Object.keys(o.fod).length;
    let h = `<div class="grab"></div><p class="sh-t">${esc(f.stand ? t(S.ops.fod.title, { stand: f.stand }) : S.ops.fod.titleNoStand)}</p><p class="sh-s">${n}/${O.FOD_ITEMS} · ${S.ops.fod.tap}</p>`;
    if (o.chocksOn) h += `<div class="warn">${S.ops.fod.locked}</div>`;
    h += checkRows(S.ops.fod.items, o.fod, 'fodTap', !!o.chocksOn);
    h += `<div class="stack mt">`;
    if (Object.values(o.fod).includes('note')) h += `<button class="btn" data-act="delayNew">${S.ops.fod.toIncident}</button>`;
    h += `<button class="btn primary" data-act="closeSheet">${S.btn.close}</button></div>`;
    return h;
  }

  /* ---------- delay sheet and code list ---------- */
  function codeListHtml(sh, act) {
    const q = String(sh.q || '').trim().toLowerCase();
    const sel = act === 'dCode' ? sh.code : null;
    let h = '';
    for (const g of GROUPS) {
      const list = O.DELAY_CODES.filter((code) => S.ops.delay.codes[code] && S.ops.delay.codes[code][1] === g && (!q || code.startsWith(q) || codeName(code).toLowerCase().includes(q)));
      if (!list.length) continue;
      h += `<div class="cgrp">${esc(S.ops.delay.groups[g])}</div>`;
      h += list.map((code) => `<button class="cchip ${sel === code ? 'on' : ''}" data-act="${act}" data-code="${code}"><b>${code}</b><span>${esc(codeName(code))}</span></button>`).join('');
    }
    if (/^\d{2}$/.test(q) && !O.DELAY_CODES.includes(q)) {
      h += `<div class="cgrp">${esc(S.ops.delay.groups.other)}</div><button class="cchip ${sel === q ? 'on' : ''}" data-act="${act}" data-code="${q}"><b>${q}</b><span>${esc(t(S.ops.delay.other, { code: q }))}</span></button>`;
    }
    return h || `<div class="hint">${S.ops.delay.empty}</div>`;
  }
  function sheetDelay(sh) {
    const f = fl();
    const min = parseInt(sh.min, 10);
    const okMin = Number.isInteger(min) && min >= 1 && min <= 999;
    const files = sh.files || [];
    return `<div class="grab"></div><p class="sh-t">${S.ops.delay.title}</p><p class="sh-s">${f ? esc(f.number) : ''}</p>
      <input id="dq" type="search" inputmode="text" placeholder="${esc(S.ops.delay.search)}" value="${esc(sh.q || '')}" autocomplete="off">
      <div class="codes" id="dcodes">${codeListHtml(sh, 'dCode')}</div>
      <label class="lbl">${S.ops.delay.minutes}<input id="dmin" type="number" inputmode="numeric" min="1" max="999" value="${esc(sh.min || '')}"></label>
      <div class="chips mt">${[5, 10, 15, 30, 60].map((v) => `<button class="fchip ${String(sh.min) === String(v) ? 'on' : ''}" data-act="dMin" data-v="${v}">${v}</button>`).join('')}</div>
      <label class="lbl">${S.ops.delay.note}<textarea id="dnote" rows="2">${esc(sh.note || '')}</textarea></label>
      <input type="file" id="dph" accept="image/*" capture="environment" multiple hidden>
      <div class="stack mt"><button class="btn sm" data-act="dPhoto">${files.length ? t(S.ops.delay.photos, { n: files.length }) : S.ops.delay.photo}</button>
      ${sh.code ? '' : `<div class="hint" style="margin:0">${S.ops.delay.noCode}</div>`}
      <button class="btn primary" data-act="dSave" ${sh.code && okMin ? '' : 'disabled'}>${S.ops.delay.save}</button><button class="btn ghost" data-act="closeSheet">${S.btn.cancel}</button></div>`;
  }

  /* ---------- special cargo ---------- */
  function specialChips(flags) {
    return flags.map((x) => `<span class="spc sp-${x}">${x}</span>`).join('');
  }
  function uldExtra(v) {
    const f = c.st().flights[v.flightId];
    if (!f) return '';
    const flags = opsOf(f).special[v.positionCode] || [];
    if (pref.role !== 'lm') {
      return flags.length ? `<div class="card" style="margin-bottom:8px"><b>${S.ops.special.onUld}</b><div class="spl mt">${specialChips(flags)}</div><div class="hint" style="margin-bottom:0">${S.ops.special.readOnly}</div></div>` : '';
    }
    return `<div class="card" style="margin-bottom:8px"><b>${S.ops.special.onUld}</b><div class="chips mt">${O.SPECIAL.map(
      (x) => `<button class="fchip sp-${x} ${flags.includes(x) ? 'on' : ''}" data-act="spToggle" data-code="${esc(v.positionCode)}" data-f="${x}" title="${esc(S.ops.special[x])}">${x}</button>`,
    ).join('')}</div><div class="hint" style="margin-bottom:0">${S.ops.special.hint}</div></div>`;
  }
  const zoneBadge = (flightId, code) => {
    const flags = O.opsOf(c.st(), flightId).special[code];
    return flags && flags.length ? `<span class="spb">${flags.join(' ')}</span>` : '';
  };
  function viewSpecial(f) {
    if (!f) return noFlight();
    const o = opsOf(f);
    const rows = Object.entries(o.special).filter(([, fl2]) => fl2.length);
    let h = `<h2>${t(S.ops.special.title, { no: esc(f.number) })}</h2>`;
    if (!rows.length) return h + `<div class="card muted">${S.ops.special.none}</div>`;
    for (const [code, flags] of rows) {
      const p = c.st().positions[`${f.id}:${code}`];
      h += `<button class="res" data-act="uld" data-id="${esc(p ? p.uldId : '')}"><div class="rt"><b class="n">${esc(uldNoAt(f.id, code))}</b><span class="spl">${specialChips(flags)}</span></div><div class="sub">${esc(code)} · ${flags.map((x) => esc(S.ops.special[x])).join(', ')}</div></button>`;
    }
    return h;
  }

  /* ---------- ready tab (loadmaster) ---------- */
  function viewReady(f) {
    if (!f) return noFlight();
    const s = c.st();
    const o = O.opsOf(s, f.id);
    const issues = O.readyIssues(s, f.id);
    const dgrN = Object.values(o.special).filter((x) => x.includes('DGR')).length;
    let h = `<div class="card tcard"><div class="gh"><span class="gt">${esc(f.number)}</span>${o.ready ? statusChip(t(S.ops.ready.confirmed, { time: fmtT(o.ready) }), 'c-load') : statusChip(S.ops.ready.not, 'c-plan')}</div><div class="meta2">${t(S.ops.ready.counts, { n: Q.counts(s, f.id).total })}${dgrN ? ' · DGR ' + dgrN : ''}</div></div>`;
    h += `<h2>${S.ops.lm.title}</h2>`;
    if (o.chocksOff) h += `<div class="warn">${S.ops.lm.locked}</div>`;
    h += `<div class="hint">${S.ops.lm.tap}</div>${checkRows(S.ops.lm.items, o.lm, 'lmTap', !!o.chocksOff)}`;
    if (!o.ready && issues.length) {
      h += `<div class="card issues"><b>${S.ops.ready.blockers}</b><ul>${issues
        .map((i) => `<li>${esc(t(S.ops.ready.issue[i.k], { item: i.idx != null ? S.ops.lm.items[i.idx] : '' }))}</li>`)
        .join('')}</ul></div>`;
    }
    if (!o.ready) {
      h += holdBtn('confirmReady', S.ops.ready.btn, issues.length > 0, S.ops.ready.fixFirst, 'primary');
      if (!issues.length) h += `<div class="hint">${S.ops.ready.allOk}</div>`;
    } else {
      h += `<button class="btn ghost" data-act="revokeReady" ${o.chocksOff ? 'disabled' : ''}>${S.ops.ready.revoke}</button>`;
    }
    h += `<div class="hint mt">${S.ops.ready.note}</div>`;
    return h;
  }

  /* ---------- shift manager: overview ---------- */
  const flightsSorted = () => Object.values(c.st().flights).sort((a, b) => a.seq - b.seq);

  function timelineHtml(flights) {
    const now = Date.now();
    const pts = [now];
    for (const f of flights) {
      const o = opsOf(f);
      const sd = O.stdMs(f);
      [sd, o.chocksOn, o.chocksOff].forEach((x) => { if (x != null) pts.push(x); });
    }
    let a = Math.min(...pts) - 20 * 60000;
    let b = Math.max(...pts) + 20 * 60000;
    if (b - a < 2 * 3600000) b = a + 2 * 3600000;
    const pos = (x) => Math.max(0, Math.min(100, ((x - a) / (b - a)) * 100)).toFixed(2);
    let h = `<div class="tlw"><div class="tlnow" style="left:${pos(now)}%"></div>`;
    const step = 3600000;
    for (let x = Math.ceil(a / step) * step; x < b; x += step) h += `<div class="tltick" style="left:${pos(x)}%"><small>${fmtT(x)}</small></div>`;
    for (const f of flights) {
      const o = opsOf(f);
      const sd = O.stdMs(f);
      const lv = O.slaView(c.st(), f, now).level;
      const from = o.chocksOn;
      const to = o.chocksOff != null ? o.chocksOff : o.chocksOn != null ? now : null;
      h += `<div class="tlrow"><span class="tlname">${esc(f.number)}</span><div class="tltrack">`;
      if (from != null) h += `<div class="tlbar lv-${lv}" style="left:${pos(from)}%;width:${Math.max(0.8, pos(to) - pos(from)).toFixed(2)}%"></div>`;
      if (sd != null) h += `<div class="tlstd" style="left:${pos(sd)}%" title="STD ${esc(f.std)}"></div>`;
      h += `</div></div>`;
    }
    return h + '</div>';
  }

  function viewOverview() {
    const s = c.st();
    const flights = flightsSorted();
    if (!flights.length) return noFlight();
    const sum = O.shiftSummary(s, Date.now());
    const K = S.ops.ch.kpi;
    const tile = (n, lbl, cls) => `<div class="kpi ${cls || ''}"><b>${n}</b><span>${esc(lbl)}</span></div>`;
    let h = `<div class="dash"><h2>${t(S.ops.ch.dayShift, { date: c.fmtD(Date.now()) })}</h2><div class="kpis">${tile(sum.flights, K.flights)}${tile(sum.ok, K.ok, 'lv-ok')}${tile(sum.warn, K.warn, 'lv-warn')}${tile(sum.late, K.late, 'lv-late')}${tile(sum.done, K.done)}${tile(sum.openDelays, K.open, sum.openDelays ? 'lv-warn' : '')}${tile(sum.dgr, K.dgr)}</div>`;
    const T = S.ops.ch.table;
    h += `<div class="tblwrap"><table class="tbl"><thead><tr><th>${T.flight}</th><th>${T.stand}</th><th>${T.status}</th><th>${T.sla}</th><th>${T.std}</th><th>${T.chocks}</th><th>${T.ready}</th><th>${T.uld}</th></tr></thead><tbody>`;
    for (const f of flights) {
      const o = opsOf(f);
      h += `<tr data-act="chDetail" data-id="${esc(f.id)}" tabindex="0"><td><b>${esc(f.number)}</b></td><td>${esc(f.stand || '—')}</td><td>${esc(S.ops.ch.st[stageOf(f)])}</td><td>${slaChip(f)}</td><td class="num">${esc(f.std || '—')}</td><td class="num">${o.chocksOn ? fmtT(o.chocksOn) : '—'}${o.chocksOff ? ' / ' + fmtT(o.chocksOff) : ''}</td><td>${o.ready ? '✓ ' + fmtT(o.ready) : '—'}</td><td class="num">${Q.counts(s, f.id).total}</td></tr>`;
    }
    h += `</tbody></table></div><h2>${S.ops.ch.timeline}</h2>${timelineHtml(flights)}</div>`;
    return h;
  }
  function sheetDetail(sh) {
    const f = c.st().flights[sh.id];
    if (!f) return '';
    const s = c.st();
    const o = O.opsOf(s, f.id);
    const tv = O.timersView(s, f.id, Date.now());
    const D = S.ops.ch.detail;
    const sp = Object.entries(o.special).filter(([, x]) => x.length);
    const ds = O.delaysOf(s, f.id);
    let h = `<div class="grab"></div><p class="sh-t">${esc(f.number)}</p><p class="sh-s">${f.stand ? esc(f.stand) + ' · ' : ''}${f.std ? 'STD ' + esc(f.std) + ' · ' : ''}${esc(S.ops.ch.st[stageOf(f)])}</p><div class="card" style="margin-bottom:8px">${slaChip(f)}<ul class="whys">${O.slaView(s, f, Date.now()).why.map((w) => `<li>${esc(whyText(w))}</li>`).join('')}</ul></div>`;
    h += `<div class="card" style="margin-bottom:8px"><b>${D.timers}</b><dl class="kv mt">${SVC_ORDER.map((k) => {
      const v = tv[k];
      return `<dt>${esc(svcName(k))}</dt><dd class="lv-${v.level}">${v.state === 'idle' ? '—' : fmtClock(v.ms)} <small>/ ${v.plan / 60000}</small></dd>`;
    }).join('')}</dl></div>`;
    h += `<div class="card" style="margin-bottom:8px"><dl class="kv"><dt>Chocks</dt><dd>${o.chocksOn ? fmtT(o.chocksOn) : '—'}${o.chocksOff ? ' / ' + fmtT(o.chocksOff) : ''}</dd><dt>${D.ready}</dt><dd>${o.ready ? fmtT(o.ready) : '—'}</dd><dt>${t(D.ulds, { n: Q.counts(s, f.id).total })}</dt><dd></dd><dt>${D.special}</dt><dd>${sp.length ? sp.map(([code, x]) => esc(code) + ' ' + x.join('+')).join(', ') : D.none}</dd></dl></div>`;
    h += `<div class="card" style="margin-bottom:8px"><b>${D.delays}</b>${ds.length ? ds.map((d) => `<div class="drow2"><span>${esc(d.code)} · ${esc(codeName(d.code))} · ${d.minutes}</span>${delayStatusChip(d)}</div>`).join('') : `<div class="hint" style="margin:6px 0 0">${D.none}</div>`}</div>`;
    return h + `<button class="btn ghost" data-act="closeSheet">${S.btn.close}</button>`;
  }

  /* ---------- shift manager: delays ---------- */
  function viewDelaysMgr() {
    const s = c.st();
    const all = O.delaysOf(s).slice().reverse();
    const open = all.filter((d) => d.status === 'PENDING' || d.status === 'ESCALATED');
    let h = `<div class="dash"><h2>${S.ops.ch.delaysTitle}<small>${t(S.ops.ch.waiting, { n: open.length })}</small></h2>`;
    if (!all.length) return h + `<div class="card muted">${S.ops.delay.none}</div></div>`;
    const C = S.ops.ch.delayCols;
    h += `<div class="dgrid">`;
    for (const d of all) {
      h += `<button class="card dcard ${d.status === 'PENDING' ? 'pend' : ''}" data-act="decideOpen" data-id="${esc(d.id)}"><div class="gh"><b>${esc(flightNo(d.flightId))} · ${esc(d.code)}</b>${delayStatusChip(d)}</div><div class="sub2">${esc(codeName(d.code))}</div><dl class="kv mt"><dt>${C.min}</dt><dd>${d.minutes}</dd><dt>${C.by}</dt><dd>${S.ops.delay.by}, ${fmtT(d.reportedAt)}</dd></dl>${d.note ? `<div class="note2">${esc(d.note)}</div>` : ''}${d.photos ? `<div class="sub2">${t(S.ops.delay.photoCount, { n: d.photos })}</div>` : ''}</button>`;
    }
    return h + '</div></div>';
  }
  function sheetDecide(sh) {
    const d = c.st().delays[sh.id];
    if (!d) return '';
    const L = S.ops.delay.decide;
    const locked = d.status === 'APPROVED';
    let h = `<div class="grab"></div><p class="sh-t">${esc(t(L.title, { no: flightNo(d.flightId), code: d.code }))}</p><p class="sh-s">${esc(codeName(d.code))} · ${d.minutes} ${S.units.min} · ${S.ops.delay.by}, ${fmtT(d.reportedAt)}</p>`;
    if (sh.pick) {
      return h + `<input id="dq" type="search" placeholder="${esc(S.ops.delay.search)}" value="${esc(sh.q || '')}" autocomplete="off"><div class="codes" id="dcodes">${codeListHtml(sh, 'dPick')}</div><div class="stack mt"><button class="btn ghost" data-act="decPickOff">${S.btn.cancel}</button></div>`;
    }
    h += `<div class="card" style="margin-bottom:8px">${delayStatusChip(d)}${d.note ? `<div class="note2">${esc(d.note)}</div>` : ''}${d.photos ? `<div class="thumbs">${Array.from({ length: d.photos }, (_, i) => `<img data-ph="dph:${esc(d.id)}:${i}" alt="">`).join('')}</div>` : ''}${d.history.map((x) => `<div class="sub2">${fmtT(x.at)} · ${esc(t(L.history, { from: x.from, to: x.to }))}</div>`).join('')}</div>`;
    h += `<div class="stack"><button class="btn primary" data-act="decide" data-d="APPROVED" ${locked ? 'disabled' : ''}>${L.approve}</button><button class="btn" data-act="decPick" ${locked ? 'disabled' : ''}>${L.changeCode}</button><button class="btn" data-act="decide" data-d="RETURNED" ${locked ? 'disabled' : ''}>${L.ret}</button><button class="btn" data-act="decide" data-d="ESCALATED" ${locked || d.status === 'ESCALATED' ? 'disabled' : ''}>${L.escalate}</button><button class="btn ghost" data-act="closeSheet">${S.btn.close}</button></div>`;
    return h;
  }

  /* ---------- shift manager: handover ---------- */
  function viewHandover() {
    const s = c.st();
    const flights = flightsSorted();
    const now = Date.now();
    const sum = O.shiftSummary(s, now);
    const H = S.ops.handover;
    let h = `<div class="dash"><h2>${H.title}<small>${H.draft}</small></h2><div class="hint">${H.auto}</div>`;
    h += `<div class="card"><b>${H.flights}</b><div class="tblwrap"><table class="tbl"><thead><tr><th>${H.cols.flight}</th><th>${H.cols.status}</th><th>${H.cols.on}</th><th>${H.cols.off}</th><th>${H.cols.uld}</th></tr></thead><tbody>${flights
      .map((f) => {
        const o = opsOf(f);
        return `<tr><td><b>${esc(f.number)}</b></td><td>${esc(S.ops.ch.st[stageOf(f)])}</td><td class="num">${o.chocksOn ? fmtT(o.chocksOn) : '—'}</td><td class="num">${o.chocksOff ? fmtT(o.chocksOff) : '—'}</td><td class="num">${Q.counts(s, f.id).total}</td></tr>`;
      })
      .join('')}</tbody></table></div></div>`;
    h += `<div class="card"><b>${t(H.delays, { n: sum.delays, min: sum.delayMinutes })}</b></div>`;
    const open = [];
    for (const d of O.openDelays(s)) open.push(t(H.openDelay, { no: flightNo(d.flightId), code: d.code }));
    for (const f of flights) {
      if (stageOf(f) === 'departed') continue;
      const v = O.slaView(s, f, now);
      open.push(t(H.openFlight, { no: f.number, st: S.ops.ch.st[stageOf(f)], why: whyText(v.why[0]) }));
    }
    h += `<div class="card"><b>${H.open}</b>${open.length ? `<ul class="whys">${open.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><div class="hint" style="margin-bottom:0">${H.openNote}</div>` : `<div class="hint" style="margin:6px 0 0">${H.openOk}</div>`}</div>`;
    const sp = [];
    for (const f of flights) for (const [code, x] of Object.entries(opsOf(f).special)) if (x.length) sp.push(`${f.number} · ${uldNoAt(f.id, code)} · ${x.join('+')}`);
    h += `<div class="card"><b>${H.specials}</b>${sp.length ? `<ul class="whys">${sp.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : `<div class="hint" style="margin:6px 0 0">${H.openOk}</div>`}</div>`;
    h += `<label class="lbl">${H.comment}<textarea id="hcom" rows="3">${esc(hcom)}</textarea></label>`;
    h += `<div class="swipe" data-swipe="sendHandover" role="button" tabindex="0" aria-label="${esc(H.send)}"><span class="swl">${S.ops.hold.swipe}</span><button class="swt" tabindex="-1" aria-hidden="true">➜</button></div>`;
    const hist = s.handovers.slice().reverse();
    if (hist.length) {
      h += `<h2>${H.history}</h2>`;
      for (const x of hist) {
        const sm = x.summary || {};
        h += `<div class="card"><div class="gh"><b>${c.fmtD(x.at)} ${fmtT(x.at)}</b>${statusChip(H.sent, 'c-load')}</div><div class="sub2">${esc(S.ops.ch.kpi.flights)}: ${sm.flights != null ? sm.flights : '—'} · ${esc(S.ops.ch.kpi.late)}: ${sm.late != null ? sm.late : '—'} · ${esc(t(H.delays, { n: sm.delays || 0, min: sm.delayMinutes || 0 }))}</div>${x.comment ? `<div class="note2">${esc(x.comment)}</div>` : ''}</div>`;
      }
    }
    return h + '</div>';
  }

  /* ---------- views and sheets entry points ---------- */
  function view(tab, f) {
    switch (tab) {
      case 'turn': return viewTurn(f);
      case 'special': return viewSpecial(f);
      case 'ready': return viewReady(f);
      case 'overview': return viewOverview();
      case 'delaysmgr': return viewDelaysMgr();
      case 'handover': return viewHandover();
      default: return null;
    }
  }
  function sheetNet() {
    const evs = c.store().getEvents().filter((e) => e.eventType !== 'ACTION_UNDONE').slice(-8).reverse();
    const n = unsynced();
    return `<div class="grab"></div><p class="sh-t">${S.ops.net.queueTitle}</p><p class="sh-s">${online ? S.ops.net.mode.online : S.ops.net.mode.offline}</p>
      <div class="card" style="margin-bottom:8px"><b>${n ? t(S.ops.net.count, { n }) : S.ops.net.none}</b><div class="hint" style="margin-bottom:0">${S.ops.net.queueText}</div></div>
      <h2>${S.ops.net.last}</h2><ul class="log card" style="padding:4px 12px">${evs.map((e) => `<li><time>${fmtT(e.occurredAt)}</time><div>${esc(c.describe(e))}</div></li>`).join('')}</ul>
      <button class="btn ghost" data-act="closeSheet">${S.btn.close}</button>`;
  }
  function sheet(sh) {
    switch (sh.t) {
      case 'fod': return sheetFod();
      case 'delay': return sheetDelay(sh);
      case 'decide': return sheetDecide(sh);
      case 'chDetail': return sheetDetail(sh);
      case 'net': return sheetNet();
      default: return null;
    }
  }
  function menuExtra() {
    const chips = (items, cur, act, key) => `<div class="chips mt">${items.map(([v, label]) => `<button class="fchip ${cur === v ? 'on' : ''}" data-act="${act}" data-${key}="${v}">${esc(label)}</button>`).join('')}</div>`;
    return `<div class="card" style="margin:0"><b>${S.ops.role.title}</b>${chips([['sv', S.ops.role.sv], ['lm', S.ops.role.lm], ['ch', S.ops.role.ch]], pref.role, 'role', 'role')}<div class="hint" style="margin:8px 0 0">${S.ops.role.hint}</div></div>
      <div class="card" style="margin:0"><b>${S.ops.theme.title}</b>${chips([['day', S.ops.theme.day], ['night', S.ops.theme.night]], pref.theme, 'theme', 'theme')}</div>`;
  }

  /* ---------- logs ---------- */
  function describe(ev) {
    const p = ev.payload || {};
    const L = S.ops.log;
    switch (ev.eventType) {
      case O.OPS_T.FOD_SET: return t(L.FOD_SET, { n: p.idx + 1, v: vText(p.value) });
      case O.OPS_T.CHOCKS_ON: return L.CHOCKS_ON;
      case O.OPS_T.CHOCKS_OFF: return L.CHOCKS_OFF;
      case O.OPS_T.SERVICE_STARTED: return t(L.SERVICE_STARTED, { svc: svcName(p.service) });
      case O.OPS_T.SERVICE_STOPPED: return t(L.SERVICE_STOPPED, { svc: svcName(p.service) });
      case O.OPS_T.DELAY_REPORTED: return t(L.DELAY_REPORTED, { code: p.code, min: p.minutes });
      case O.OPS_T.DELAY_DECIDED: {
        const d = c.st().delays[p.delayId];
        return t(L.DELAY_DECIDED, { code: p.code || (d ? d.code : ''), v: S.ops.delay.status[p.decision] || p.decision });
      }
      case O.OPS_T.SPECIAL_CARGO_SET: return t(L.SPECIAL_CARGO_SET, { code: p.code, v: p.flags && p.flags.length ? p.flags.join('+') : vText(null) });
      case O.OPS_T.LM_CHECK_SET: return t(L.LM_CHECK_SET, { n: p.idx + 1, v: vText(p.value) });
      case O.OPS_T.READY_CONFIRMED: return L.READY_CONFIRMED;
      case O.OPS_T.READY_REVOKED: return L.READY_REVOKED;
      case O.OPS_T.HANDOVER_SENT: return L.HANDOVER_SENT;
      default: return null;
    }
  }
  function flightOf(ev) {
    const p = ev.payload || {};
    if (p.delayId && c.st().delays[p.delayId]) return c.st().delays[p.delayId].flightId;
    return null;
  }

  /* ---------- actions (merged into app.js's action map) ---------- */
  const actions = {
    role(d) {
      if (!ROLE_TABS[d.role]) return;
      pref.role = d.role;
      savePref();
      if (!tabs().includes(c.ui.tab)) c.ui.tab = tabs()[0];
      c.savePrefs();
      c.closeSheet();
      c.render();
    },
    theme(d) { pref.theme = d.theme === 'night' ? 'night' : 'day'; savePref(); applyTheme(); c.render(); },
    netInfo() { c.openSheet({ t: 'net' }); },
    fodOpen() { c.openSheet({ t: 'fod' }); },
    fodTap(d) {
      const f = fl();
      const i = Number(d.i);
      run(O.setFod, { flightId: f.id, idx: i, value: cycle(opsOf(f).fod[i] || null) });
    },
    chocksOn() {
      const f = fl();
      run(O.chocksOn, { flightId: f.id }, t(S.ops.toast.chocksOn, { no: f.number, time: fmtT(Date.now()) }));
    },
    chocksOff() {
      const f = fl();
      run(O.chocksOff, { flightId: f.id }, t(S.ops.toast.chocksOff, { no: f.number, time: fmtT(Date.now()) }));
    },
    svcStart(d) { run(O.startService, { flightId: fl().id, service: d.svc }, t(S.ops.toast.start, { svc: svcName(d.svc) })); },
    svcStop(d) { run(O.stopService, { flightId: fl().id, service: d.svc }, t(S.ops.toast.stop, { svc: svcName(d.svc) })); },
    delayNew() { c.openSheet({ t: 'delay', code: null, min: '', note: '', q: '', files: [] }); },
    dCode(d) { c.ui.sheet.code = d.code; c.renderSheet(); },
    dMin(d) { c.ui.sheet.min = d.v; c.renderSheet(); },
    dPhoto() { const i = c.$('dph'); if (i) i.click(); },
    dSave() {
      const sh = c.ui.sheet;
      const f = fl();
      const minutes = parseInt(sh.min, 10);
      const files = (sh.files || []).slice(0, 5);
      const r = c.store().run(O.reportDelay, { flightId: f.id, code: sh.code, minutes, note: sh.note, photos: files.length });
      if (!r.ok) { c.toast((r.error && S.err[r.error.code]) || S.err.generic, false, true); return; }
      const id = r.events[0].payload.delayId;
      files.forEach((file, i) => putFile(`dph:${id}:${i}`, file));
      c.closeSheet();
      c.toast(t(S.ops.toast.delay, { no: f.number, code: sh.code, min: minutes }), true);
      c.render();
    },
    spToggle(d) {
      const f = fl();
      const cur = opsOf(f).special[d.code] || [];
      const next = cur.includes(d.f) ? cur.filter((x) => x !== d.f) : [...cur, d.f];
      run(O.setSpecialCargo, { flightId: f.id, code: d.code, flags: next }, t(S.ops.toast.special, { code: d.code, v: next.length ? next.join('+') : vText(null) }));
    },
    lmTap(d) {
      const f = fl();
      const i = Number(d.i);
      run(O.setLmCheck, { flightId: f.id, idx: i, value: cycle(opsOf(f).lm[i] || null) });
    },
    confirmReady() {
      const f = fl();
      run(O.confirmReady, { flightId: f.id }, t(S.ops.toast.ready, { no: f.number }));
    },
    revokeReady() {
      const f = fl();
      run(O.revokeReady, { flightId: f.id }, t(S.ops.toast.unready, { no: f.number }));
    },
    chDetail(d) { c.openSheet({ t: 'chDetail', id: d.id }); },
    decideOpen(d) { c.openSheet({ t: 'decide', id: d.id, pick: false, q: '' }); },
    decPick() { c.ui.sheet.pick = true; c.ui.sheet.q = ''; c.renderSheet(); },
    decPickOff() { c.ui.sheet.pick = false; c.renderSheet(); },
    dPick(d) {
      const sh = c.ui.sheet;
      const dl = c.st().delays[sh.id];
      if (!dl) return;
      run(O.changeDelayCode, { delayId: sh.id, code: d.code }, t(S.ops.toast.decided, { no: flightNo(dl.flightId), code: d.code, v: S.ops.delay.status.PENDING }));
      if (c.ui.sheet === sh) { sh.pick = false; c.renderSheet(); }
    },
    decide(d) {
      const sh = c.ui.sheet;
      const dl = c.st().delays[sh.id];
      if (!dl) return;
      run(O.decideDelay, { delayId: sh.id, decision: d.d }, t(S.ops.toast.decided, { no: flightNo(dl.flightId), code: dl.code, v: S.ops.delay.status[d.d] }), { close: true });
    },
    sendHandover() {
      const el = c.$('hcom');
      if (el) hcom = el.value;
      const r = run(O.sendHandover, { comment: hcom }, S.ops.toast.handover);
      if (r.ok) { hcom = ''; c.render(); }
    },
  };

  /* ---------- hold-to-confirm and swipe-to-send ---------- */
  function initHold() {
    let h = null;
    const stop = (early) => {
      if (!h) return;
      clearTimeout(h.timer);
      h.el.classList.remove('holding');
      if (early) c.toast(S.ops.hold.hint, false);
      h = null;
    };
    const begin = (el) => {
      stop(false);
      el.classList.add('holding');
      h = {
        el,
        timer: setTimeout(() => {
          const act = el.dataset.hold;
          h = null;
          el.classList.remove('holding');
          try { navigator.vibrate && navigator.vibrate(40); } catch (e) { /* no vibration */ }
          if (actions[act]) actions[act](el.dataset);
        }, HOLD_MS),
      };
    };
    document.addEventListener('pointerdown', (e) => {
      const el = e.target.closest && e.target.closest('[data-hold]');
      if (!el || el.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
      begin(el);
    });
    document.addEventListener('pointerup', () => stop(true));
    document.addEventListener('pointercancel', () => stop(false));
    document.addEventListener('pointerout', (e) => {
      if (h && e.target === h.el && !h.el.contains(e.relatedTarget)) stop(false);
    });
    document.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('[data-hold],[data-swipe]')) e.preventDefault(); });
    document.addEventListener('keydown', (e) => {
      const el = e.target.closest && e.target.closest('[data-hold]');
      if (el && (e.key === 'Enter' || e.key === ' ') && !e.repeat && !el.disabled) { e.preventDefault(); begin(el); }
    });
    document.addEventListener('keyup', (e) => {
      if (h && (e.key === 'Enter' || e.key === ' ')) stop(true);
    });
  }
  function initSwipe() {
    let sw = null;
    document.addEventListener('pointerdown', (e) => {
      const th = e.target.closest && e.target.closest('.swt');
      if (!th) return;
      const box = th.parentElement;
      sw = { th, box, x0: e.clientX, max: box.clientWidth - th.offsetWidth - 8, id: e.pointerId };
      try { th.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      box.classList.add('drag');
    });
    document.addEventListener('pointermove', (e) => {
      if (!sw || e.pointerId !== sw.id) return;
      const dx = Math.max(0, Math.min(sw.max, e.clientX - sw.x0));
      sw.th.style.transform = `translateX(${dx}px)`;
      sw.dx = dx;
    });
    const end = (fire) => {
      if (!sw) return;
      const { th, box, dx, max } = sw;
      sw = null;
      box.classList.remove('drag');
      th.style.transform = '';
      if (fire && dx >= max * SWIPE_AT && actions[box.dataset.swipe]) actions[box.dataset.swipe]({});
    };
    document.addEventListener('pointerup', () => end(true));
    document.addEventListener('pointercancel', () => end(false));
    document.addEventListener('keydown', (e) => {
      const box = e.target.closest && e.target.closest('[data-swipe]');
      if (box && e.key === 'ArrowRight' && actions[box.dataset.swipe]) actions[box.dataset.swipe]({});
    });
  }

  /* ---------- text fields, photos, live timers, network ---------- */
  function initInputs() {
    document.addEventListener('input', (e) => {
      const el = e.target;
      const sh = c.ui.sheet;
      if (el.id === 'dq' && sh) {
        sh.q = el.value;
        const box = c.$('dcodes');
        if (box) box.innerHTML = codeListHtml(sh, sh.t === 'delay' ? 'dCode' : 'dPick');
      } else if (el.id === 'dmin' && sh && sh.t === 'delay') {
        sh.min = el.value;
        const b = document.querySelector('[data-act="dSave"]');
        const m = parseInt(el.value, 10);
        if (b) b.disabled = !(sh.code && Number.isInteger(m) && m >= 1 && m <= 999);
      } else if (el.id === 'dnote' && sh) sh.note = el.value;
      else if (el.id === 'hcom') hcom = el.value;
    });
    document.addEventListener('change', (e) => {
      const el = e.target;
      if (el && el.id === 'dph' && c.ui.sheet && c.ui.sheet.t === 'delay') {
        c.ui.sheet.files = Array.from(el.files || []).slice(0, 5);
        c.renderSheet();
      }
    });
  }
  function initLive() {
    setInterval(() => {
      const f = fl();
      if (!f || c.ui.tab !== 'turn') return;
      const tv = O.timersView(c.st(), f.id, Date.now());
      document.querySelectorAll('[data-tm]').forEach((el) => {
        const v = tv[el.dataset.tm];
        if (!v || v.state !== 'run') return;
        el.textContent = fmtClock(v.ms);
        const row = el.closest('.trow');
        if (row) {
          row.className = row.className.replace(/lv-\w+/, 'lv-' + v.level);
          const bar = row.querySelector('.bar i');
          if (bar) bar.style.width = Math.min(100, Math.round((v.ms / v.plan) * 100)) + '%';
        }
      });
    }, 1000);
    // status lights and the dashboard move with the clock even when nobody touches the screen
    setInterval(() => {
      if (c.ui.sheet || !['turn', 'overview', 'delaysmgr'].includes(c.ui.tab)) return;
      if (document.querySelector('.holding,.swipe.drag')) return;
      c.render();
    }, 30000);
  }
  function initNet() {
    const set = (v) => { online = v; c.render(); };
    window.addEventListener('online', () => set(true));
    window.addEventListener('offline', () => set(false));
  }
  /** After a sheet is drawn: photos of a delay come from the local file store. */
  function after() {
    document.querySelectorAll('img[data-ph]').forEach((img) => {
      if (img.src) return;
      getFile(img.dataset.ph).then((b) => { if (b) img.src = URL.createObjectURL(b); });
    });
  }
  function init() {
    applyTheme();
    initHold();
    initSwipe();
    initInputs();
    initLive();
    initNet();
  }

  return { tabs, allTabs, isOpsTab, wide, showFlight, view, sheet, after, menuExtra, uldExtra, zoneBadge, netChip, roleChip, describe, flightOf, actions, init, icons: OPS_ICONS };
}
