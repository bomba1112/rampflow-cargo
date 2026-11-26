// Language switch. S is one mutable object that always holds the active language,
// so every module can keep `import { S }` and read S.xxx at render time.
import { RU } from './strings.ru.js';
import { AZ } from './strings.az.js';
import { OPS_RU } from './strings.ops.ru.js';
import { OPS_AZ } from './strings.ops.az.js';

// the turnaround functions live in their own string files; they are added to the base pack here
const withOps = (base, ops) => ({ ...base, ops, tabs: { ...base.tabs, ...ops.tabs }, err: { ...base.err, ...ops.err } });
const PACKS = { az: withOps(AZ, OPS_AZ), ru: withOps(RU, OPS_RU) };
const KEY = 'rampflow.lang';
export const S = {};
let current = 'az';

export function t(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : vars[k]));
}
export const getLang = () => current;
export function setLang(lang, persist = true) {
  current = PACKS[lang] ? lang : 'az';
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, PACKS[current]);
  try {
    if (persist) localStorage.setItem(KEY, current);
    document.documentElement.lang = current;
  } catch (e) {
    /* language is a convenience only */
  }
}
let saved = null;
try {
  saved = localStorage.getItem(KEY);
} catch (e) {
  /* ignore */
}
setLang(saved || 'az', false);
