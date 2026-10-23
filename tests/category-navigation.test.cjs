const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');
const taxonomy = require(path.join(process.env.CATEGORY_TEST_BUILD, 'categories.js'));

function renderNavigation(openCategory = null) {
  const filename = path.join(__dirname, '../src/components/CategoryNavigation.tsx');
  const componentModule = { exports: {} };
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const mocks = {
    react: { ...React, useState: () => [openCategory, () => {}] },
    'next/link': { __esModule: true, default: 'a' },
    'next/navigation': { usePathname: () => '/' },
    '@/lib/categories': taxonomy,
  };
  vm.runInNewContext(outputText, {
    module: componentModule, exports: componentModule.exports,
    require: name => name in mocks ? mocks[name] : require(name),
  }, { filename });
  return renderToStaticMarkup(React.createElement(componentModule.exports.CategoryNavigation));
}

test('category strip uses the shared navigation theme without legacy colors', () => {
  const html = renderNavigation();
  assert.match(html, /aria-label="Shop by category" class="site-nav relative z-40[^"]*bg-slate-950/);
  assert.match(html, /hover:bg-slate-800 hover:text-emerald-400/);
  assert.match(html, /focus-visible:outline-emerald-400/);
  assert.match(html, /focus-visible:!outline-offset-\[-3px\]/);
  assert.doesNotMatch(html, /(?:bg|text|border|outline)-(?:blue|gray)-|bg-white/);
  assert.equal((html.match(/aria-expanded="false"/g) || []).length, taxonomy.CATEGORIES.length * 2);
});

test('desktop dropdown and mobile accordion share emerald active states and slate panels', () => {
  const html = renderNavigation(0);
  assert.equal((html.match(/aria-expanded="true"/g) || []).length, 2);
  assert.equal((html.match(/border-emerald-400 bg-slate-800 text-emerald-400/g) || []).length, 2);
  assert.match(html, /max-h-\[65dvh\][^"]*border-slate-700 bg-slate-900/);
  assert.match(html, /class="bg-slate-900 p-4"/);
  assert.match(html, /border border-slate-700 bg-slate-800/);
  const href = taxonomy.categoryHref(taxonomy.CATEGORIES[0].id);
  assert.equal(html.split(`href="${href}"`).length - 1, 2);
  for (const viewport of ['desktop', 'mobile']) {
    const trigger = html.match(new RegExp(`id="([^"]*-${viewport}-0-trigger)"[^>]*aria-expanded="true" aria-controls="([^"]+)"`));
    assert.ok(trigger);
    assert.ok(html.includes(`id="${trigger[2]}" aria-labelledby="${trigger[1]}"`));
  }
  assert.match(html, /fixed inset-0 z-30 bg-black\/25/);
  assert.doesNotMatch(html, /(?:bg|text|border|outline)-(?:blue|gray)-|bg-white/);
});

test('desktop categories use tighter gaps and padding with unchanged font sizes and mobile sizing', () => {
  const html = renderNavigation();
  assert.match(html, /<div class="hidden px-1 md:block lg:px-6"><ul class="flex flex-nowrap gap-0 lg:gap-0\.5">/);
  assert.match(html, /max-h-\[65dvh\] max-w-7xl/);
  assert.equal(taxonomy.CATEGORIES.length, 9);
  const desktopTriggers = [...html.matchAll(/<button[^>]*id="[^"]*-desktop-\d+-trigger"[^>]*class="([^"]*)"/g)];
  const mobileTriggers = [...html.matchAll(/<button[^>]*id="[^"]*-mobile-\d+-trigger"[^>]*class="([^"]*)"/g)];
  assert.equal(desktopTriggers.length, 9);
  assert.equal(mobileTriggers.length, 9);
  for (const [, classes] of desktopTriggers) {
    assert.match(classes, /gap-0 whitespace-nowrap px-0 text-\[9\.5px\] tracking-tighter lg:gap-0\.5 lg:text-xs xl:px-0\.5 xl:text-\[13px\]/);
  }
  for (const [, classes] of mobileTriggers) {
    assert.match(classes, /gap-2 px-4 text-sm/);
    assert.doesNotMatch(classes, /whitespace-nowrap|text-\[9\.5px\]|tracking-tighter/);
  }
  assert.doesNotMatch(html, /overflow-x-auto|w-max|Scroll categories (left|right)/);
  for (const parent of taxonomy.CATEGORIES) {
    const encoded = parent.label.replaceAll('&', '&amp;');
    assert.ok(html.includes(encoded));
  }
});

test('both disclosure layouts render nested tier-three links with scoped routes', () => {
  for (const [index, parent] of taxonomy.CATEGORIES.entries()) {
    const html = renderNavigation(index);
    for (const child of parent.subcategories) {
      for (const type of child.itemTypes ?? []) {
        const href = taxonomy.categoryHref(parent.id, child.id, type.id).replaceAll('&', '&amp;');
        assert.equal(html.split(`href="${href}"`).length - 1, 2);
      }
    }
  }
});
