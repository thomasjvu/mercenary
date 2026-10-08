import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const docsRequire = createRequire(new URL('../../apps/docs/package.json', import.meta.url));
const tailwindRequire = createRequire(docsRequire.resolve('tailwindcss/package.json'));
const micromatchRequire = createRequire(tailwindRequire.resolve('micromatch'));
const braces = micromatchRequire('braces');

test('patched braces preserves ordinary glob expansion and compilation', () => {
  assert.deepEqual(braces.expand('src/{api,web}/*.{ts,tsx}'), [
    'src/api/*.ts',
    'src/api/*.tsx',
    'src/web/*.ts',
    'src/web/*.tsx',
  ]);
  assert.equal(braces.compile('src/{api,web}/*.ts'), 'src/(api|web)/*.ts');
  assert.equal(braces.stringify(braces.parse('{a,{b,c}}')), '{a,{b,c}}');
});

test('patched braces bounds parsing before recursive walkers run', () => {
  for (const [open, close] of [
    ['{', '}'],
    ['(', ')'],
  ]) {
    const pattern = open.repeat(4_000) + 'a,b' + close.repeat(4_000);
    for (const method of ['parse', 'compile', 'expand', 'stringify', 'create']) {
      assert.throws(
        () => braces[method](pattern),
        {
          name: 'SyntaxError',
          message: /maximum nesting depth/,
        },
        method
      );
    }
    assert.throws(() => braces(pattern), { name: 'SyntaxError' });
  }
});

test('patched braces guards supplied ASTs and cyclic ASTs', () => {
  let ast = { type: 'text', value: 'a' };
  for (let i = 0; i < 256; i += 1) ast = { type: 'root', nodes: [ast] };
  const cyclic = { type: 'root', nodes: [] };
  cyclic.nodes.push(cyclic);
  for (const method of ['compile', 'expand', 'stringify']) {
    for (const input of [ast, cyclic]) {
      assert.throws(
        () => braces[method](input),
        {
          name: 'SyntaxError',
          message: /maximum nesting depth/,
        },
        method
      );
    }
  }
});
