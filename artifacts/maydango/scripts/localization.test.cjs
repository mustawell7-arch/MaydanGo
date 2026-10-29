const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
// Load pure TypeScript data without Expo/Metro. Images are opaque catalog assets.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
require.extensions['.jpg'] = (module) => { module.exports = 1; };
const { content, localize, locale, number, currency, dateTime, errorCopy } = require('../lib/content.ts');
const { facilities, sessions, communityEvents, coaches, courses } = require('../data/demo.ts');
const { translate, isRtl } = require('../lib/i18n.ts');
const { inputTextDirection } = require('../lib/text-direction.ts');
let checked = 0;
for (const language of ['ar', 'ku']) {
  for (const [key, translations] of Object.entries(content)) {
    assert.ok(translations.every(s => s.trim().length), key);
    assert.notEqual(localize(key, language), key, key);
    checked++;
  }
  const groups = [
    [facilities, ['name', 'category', 'district', 'city', 'gender', 'openUntil', 'description']],
    [sessions, ['title', 'instructor', 'time', 'duration', 'level', 'gender']],
    [communityEvents, ['title', 'city', 'venue', 'date', 'access', 'description']],
    [coaches, ['name', 'specialty', 'languages', 'availability']],
    [courses, ['instructor', 'duration', 'level']],
  ];
  for (const [rows, fields] of groups) for (const row of rows) for (const field of fields) {
    assert.ok(!/[A-Za-z]/.test(localize(row[field], language)), `${language} ${row.id}.${field}: ${localize(row[field], language)}`);
    checked++;
  }
  for (const course of courses) {
    for (const text of [course.localTitle, course.summary, ...course.sampleLessons.flatMap(l => [l.title, l.body])]) {
      assert.ok(text[language] && text[language] !== text.en);
    }
  }
  assert.ok(isRtl(language));
  assert.ok(!/[0-9]/.test(number(55000, language)));
  assert.equal(currency(55000, language), new Intl.NumberFormat(locale(language), { style: 'currency', currency: 'IQD', maximumFractionDigits: 0 }).format(55000));
  assert.equal(dateTime('2026-10-25T21:30:00Z', language), new Intl.DateTimeFormat(locale(language), { timeZone: 'Asia/Baghdad', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date('2026-10-25T21:30:00Z')));
  assert.notEqual(translate(language, 'storageSaveError'), translate('en', 'storageSaveError'));
  assert.ok(localize('Women-only sessions', language) !== localize('Mixed sessions', language));
}
assert.equal(localize('MaydanGo', 'ar'), 'MaydanGo');
assert.equal(localize('MaydanGo cancelled Enrol organiser Centre racket hire', 'en'), 'MaydanGO canceled Enroll organizer Center racket rental');
assert.equal(localize('Anything unchanged', 'en'), 'Anything unchanged');
assert.equal(isRtl('en'), false);
assert.equal(inputTextDirection('en'), 'ltr');
assert.equal(inputTextDirection('ar'), 'rtl');
assert.equal(inputTextDirection('ku'), 'rtl');
assert.equal(inputTextDirection('ar', 'ltr'), 'ltr');
assert.equal(errorCopy({ data: { message: 'This class is full.' } }), 'This class is full.');
assert.equal(errorCopy({ errors: [{ code: 'form_code_incorrect' }] }), 'The verification code is incorrect or expired. Request a new code.');
assert.equal(errorCopy(new Error('secret provider details')), 'Account request failed. Please check your details and try again.');
assert.equal(translate('en', 'checkInHint'), 'At the door? Scan to check in.');
assert.equal(translate('ar', 'checkInHint'), 'وصلت؟ امسح الكود وسجّل وصولك.');
assert.equal(translate('ku', 'checkInHint'), 'گەیشتیت؟ کۆدەکە سکان بکە و گەیشتنت تۆمار بکە.');
assert.equal(translate('en', 'visitsLeft'), '{n} visits left');
assert.equal(translate('en', 'spotsLeft'), '{n} spots left');
assert.equal(translate('en', 'cancelled'), 'Booking canceled');
assert.equal(translate('en', 'notAttendance'), 'A booking isn’t attendance. Arrival counts only after the place confirms it.');
const finalCircuit = courses.flatMap(course => course.sampleLessons).find(lesson => lesson.id === 'sf-4');
assert.ok(finalCircuit);
assert.match(finalCircuit.body.en, /Stop right away if anything feels sharp or painful/);
assert.match(finalCircuit.body.ar, /أوقف التمرين فوراً إذا شعرت بألم حاد/);
assert.match(finalCircuit.body.ku, /دەستبەجێ ڕابوەستە/);
assert.doesNotMatch(finalCircuit.body.en, /doctor|health condition/i);
// Report authored JSX copy that still contains English, excluding branding.
if (process.argv.includes('--audit')) {
  const scan = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? scan(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  for (const file of scan(path.join(root, 'app')).filter(f => f.endsWith('.tsx'))) {
    const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = n => {
      if (ts.isJsxText(n)) {
        const source = n.text.replace(/\s+/g, ' ').trim();
        const remaining = localize(source, 'ar').replace(/MaydanGo|MAYDANGO|Google|QR|MDG|English|Oops|M/g, '');
        if (/[A-Za-z]{2}/.test(remaining)) console.log(path.relative(root, file), JSON.stringify(source), '=>', remaining);
      }
      ts.forEachChild(n, visit);
    };
    visit(ast);
  }
}
console.log(`Localization checks passed (${checked} translated phrases and catalog fields).`);
