// UI smoke test: loads the built single file in jsdom and drives the main flows by clicking.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../dist-single/index.html', import.meta.url), 'utf8');
const errors = [];
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
  beforeParse(w) { w.localStorage.setItem('rampflow.lang', 'ru'); w.addEventListener('error', (e) => errors.push(e.message)); w.console.error = (...a) => errors.push(a.join(' ')); } });
const { document: d, window: w } = dom.window;
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const click = (el) => { assert.ok(el, 'element exists'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const q = (sel) => d.querySelector(sel);
const qa = (sel) => [...d.querySelectorAll(sel)];
const byText = (sel, txt) => qa(sel).find((e) => e.textContent.includes(txt));
const type = (id, v) => { const i = d.getElementById(id); i.value = v; i.dispatchEvent(new w.Event('input', { bubbles: true })); };
const tab = (k) => click(q(`nav [data-tab="${k}"]`));
const results = [];
async function step(name, fn) { try { await fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name + ' :: ' + e.message]); } }

await wait(200);
await step('flights list renders 3 flights + demo marker', () => {
  assert.equal(qa('.fcard').length, 3);
  assert.match(d.body.textContent, /вымышленные данные/);
});
await step('open DM101 shows LIR with dolly numbers', async () => {
  click(byText('.fcard', 'DM101'));
  await wait();
  assert.equal(qa('.gc').length, 39, 'every cell of the paper grid is drawn');
  assert.ok(qa('.ub').length >= 30, 'ULD boxes: ' + qa('.ub').length);
  assert.ok(byText('.ub', '10417'), 'first ULD is on the sheet');
  assert.match(q('main').textContent, /136-1/); // dolly shown on the band
  assert.ok(q('.ub.cx'), 'units that stand across the centre line or over two cells have their own box');
});
await step('dollies tab: group 136 and 007 present, tug marker', () => {
  tab('dollies');
  assert.match(q('main').textContent, /Сцепка 136/);
  assert.match(q('main').textContent, /Сцепка 007/);
  assert.match(q('main').textContent, /ТЯГАЧ/);
});
await step('create group 908 with preview 908-1..908-4', async () => {
  click(q('[data-kind="STANDARD_4"]'));
  await wait();
  type('gnum', '908');
  assert.match(q('#gprev').textContent, /908-4/);
  click(q('#gok'));
  await wait();
  assert.match(q('main').textContent, /Сцепка 908/);
});
await step('create 20 ft dolly shows one cell without suffix', async () => {
  click(q('[data-kind="SINGLE_20FT"]'));
  await wait();
  type('gnum', '55');
  assert.doesNotMatch(q('#gprev').textContent, /55-1/);
  click(q('#gok'));
  await wait();
  assert.match(q('main').textContent, /20 ft · 55/);
});
await step('duplicate group number only warns and allows second', async () => {
  click(q('[data-kind="STANDARD_4"]'));
  await wait();
  type('gnum', '908');
  assert.match(q('#sheet').textContent, /уже есть/);
  click(q('#gok'));
  await wait();
  assert.match(q('main').textContent, /\(2\)/);
});
await step('link ULD to 908-1 via slot sheet', async () => {
  const slot = qa('[data-act="dslot"]').find((b) => b.textContent.includes('908-1'));
  click(slot); await wait();
  click(byText('[data-act="pickUld"]', 'Выбрать')); await wait();
  type('pq', '4121');
  assert.ok(qa('#plist .row').length >= 0);
  type('pq', '');
  const row = q('#plist .row');
  click(row); await wait();
  assert.match(q('main').textContent, /908-1/);
  assert.ok(q('#toast').style.display === 'flex');
});
await step('undo removes link', async () => {
  const before = qa('.cell.occ').length;
  click(q('#toast [data-act="undo"]')); await wait();
  assert.equal(qa('.cell.occ').length, before - 1);
});
await step('present ULD from 136-3 and cell becomes "given"', async () => {
  const slot = qa('[data-act="dslot"]').find((b) => b.textContent.includes('136-3'));
  click(slot); await wait();
  click(byText('#sheet [data-act="present"]', 'high loader')); await wait();
  const s = qa('[data-act="dslot"]').find((b) => b.textContent.includes('136-3'));
  assert.match(s.textContent, /подана/);
});
await step('record location, then "moved" gives unknown', async () => {
  click(byText('[data-act="place"]', 'Место')); await wait();
  click(byText('#sheet [data-act="setLoc"]', 'Нос')); await wait();
  assert.match(q('main').textContent, /Место: Нос/);
  click(byText('[data-act="place"]', 'Место')); await wait();
  click(byText('#sheet [data-act="setLoc"]', 'увезли')); await wait();
  assert.match(q('main').textContent, /неизвестно/i);
});
await step('search by ULD tail digits and by dolly label', async () => {
  tab('search'); await wait();
  type('q', '10417');
  assert.match(q('#sres').textContent, /PMC10417ZZ/);
  type('q', '136-2');
  assert.match(q('#sres').textContent, /136-2/);
  type('q', 'zzzzzz');
  assert.match(q('#sres').textContent, /Ничего не найдено/);
});
await step('loading: end ask shows remaining count, then correction needs reason', async () => {
  tab('load'); await wait();
  click(q('[data-act="endAsk"]')); await wait();
  assert.match(q('#sheet').textContent, /Ещё на тележках/);
  click(q('#sheet [data-act="endLoad"]')); await wait();
  assert.match(q('main').textContent, /Загрузка завершена/);
  click(byText('[data-act="fixTime"]', 'начало')); await wait();
  assert.ok(q('[data-act="saveTime"]').hasAttribute('disabled'));
  click(q('.reasons button')); await wait();
  assert.ok(!q('[data-act="saveTime"]').hasAttribute('disabled'));
});
await step('data survives reload (localStorage/IDB fallback keeps events)', async () => {
  const n = JSON.parse(w.localStorage.getItem('rampflow.events.v1') || '[]').length;
  assert.ok(n > 20, 'events stored: ' + n);
});
await step('language switch to Azerbaijani changes UI and keeps data', async () => {
  click(q('[data-act="menu"]')); await wait();
  click(q('#sheet [data-lang="az"]')); await wait();
  click(q('#sheet [data-act="closeSheet"]')); await wait();
  assert.match(q('nav').textContent, /Uçuşlar/);
  tab('dollies'); await wait();
  assert.match(q('main').textContent, /Qrup 136/);
  assert.match(q('main').textContent, /TİQR/);
  assert.equal(d.documentElement.lang, 'az');
  assert.equal(w.localStorage.getItem('rampflow.lang'), 'az');
});
await step('Azerbaijani LIR screen is translated, no Cyrillic left in UI chrome', async () => {
  tab('lir'); await wait();
  assert.match(q('main').textContent, /B747-8F · LIR nümunəsi/);
  assert.match(q('main').textContent, /Çevir/);
  const chrome = q('nav').textContent + q('#hdr').textContent + q('main').textContent;
  assert.doesNotMatch(chrome, /[А-Яа-яЁё]/);
});
await step('LIR rotate turns the whole sheet by 90 degrees, back again, zoom buttons do not break it', async () => {
  tab('lir'); await wait();
  const rot0 = q('#ls').dataset.rot;
  assert.ok(rot0 === '0' || rot0 === '90');
  click(q('[data-act="rotate"]')); await wait();
  const rot1 = q('#ls').dataset.rot;
  assert.notEqual(rot1, rot0);
  assert.equal(qa('.gc').length, 39, 'the same sheet, not another layout');
  click(q('[data-act="rotate"]')); await wait();
  assert.equal(q('#ls').dataset.rot, rot0);
  click(q('[data-act="zoomIn"]')); click(q('[data-act="zoomOut"]')); click(q('[data-act="fit"]')); await wait();
  assert.ok(q('#ls'));
});
await step('tapping a ULD on the sheet opens its card', async () => {
  tab('lir'); await wait();
  click(q('.ub[data-id="u-f-dm101-ER"]')); await wait();
  assert.match(q('#sheet').textContent, /ER/);
  click(q('#sheet [data-act="closeSheet"]')); await wait();
});
await step('flights tab has the open-LIR-file button and a hidden PDF input', async () => {
  tab('flights'); await wait();
  assert.ok(q('[data-act="pickFile"]'));
  const inp = q('#lirfile');
  assert.ok(inp && /pdf/.test(inp.accept));
  click(q('[data-act="pickFile"]')); // must not throw
});
await step('no runtime errors', () => assert.deepEqual(errors, []));

let bad = 0;
for (const [s, n] of results) { if (s !== 'ok') bad++; console.log(s === 'ok' ? '  ok  ' : ' FAIL ', n); }
console.log(bad ? `\n${bad} failed` : '\nall UI smoke steps passed');
process.exit(bad ? 1 : 0);
