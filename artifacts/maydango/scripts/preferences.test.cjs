const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
// Exercise the real preferences provider with deterministic hooks/storage,
// without signing into an account or touching a user's device data.
let cells = [], cursor = 0, effects = [], storage = new Map();
const react = {
  createContext: () => ({ Provider: 'provider' }),
  createElement: (type, props) => ({ type, props }),
  useState(initial) {
    const i = cursor++;
    if (!(i in cells)) cells[i] = initial;
    return [cells[i], next => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }];
  },
  useRef(initial) { const i = cursor++; return cells[i] ?? (cells[i] = { current: initial }); },
  useEffect(fn, deps) {
    const i = cursor++;
    if (!cells[i] || deps.some((v, j) => !Object.is(v, cells[i][j]))) { cells[i] = deps; effects.push(fn); }
  },
  useContext() { throw new Error('not used'); },
};
const mocks = {
  react,
  '@react-native-async-storage/async-storage': {
    getItem: async key => storage.get(key) ?? null,
    setItem: async (key, value) => { storage.set(key, value); },
  },
  '@/hooks/useMemberBookings': { useMemberBookings: () => ({}) },
  '@/data/demo': { courses: [] },
};
const original = Module._load;
Module._load = function(id, ...args) { return mocks[id] ?? original.call(this, id, ...args); };
require.extensions['.tsx'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText, filename);
const { AppProvider } = require('../contexts/AppContext.tsx');
const render = () => { cursor = 0; return AppProvider({ children: null }).props.value; };
const settle = async () => {
  for (const effect of effects.splice(0)) effect();
  await new Promise(resolve => setImmediate(resolve));
};
(async () => {
  let app = render();
  assert.equal(app.hydrated, false);
  await settle(); app = render(); await settle();
  assert.equal(app.hydrated, true);
  for (const language of ['ar', 'ku', 'en']) {
    app.setLanguage(language); app = render(); await settle();
    assert.equal(JSON.parse(storage.get('maydango-preferences-v2')).language, language);
    // Cold mount loads the last selected language instead of overwriting it.
    cells = []; effects = [];
    app = render(); await settle(); app = render(); await settle();
    assert.equal(app.language, language);
  }
  app.setLanguage('ar'); render();
  app.setLanguage('ku'); render();
  await settle();
  assert.equal(JSON.parse(storage.get('maydango-preferences-v2')).language, 'ku');
  storage.set('maydango-preferences-v2', '{"language":"invalid"}');
  cells = []; effects = []; render(); await settle(); app = render(); await settle();
  assert.equal(app.storageError, 'load');
  assert.equal(app.language, 'en');
  assert.equal(storage.get('maydango-preferences-v2'), '{"language":"invalid"}');
  console.log('Language persistence, cold hydration, rapid changes, and invalid-data recovery passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
