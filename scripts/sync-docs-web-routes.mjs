import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = resolve(repoRoot, 'docs/reference/web-routes.template.json');
const routesDocPath = resolve(repoRoot, 'docs/reference/routes.md');
const startMarker = '<!-- docs:template:web-routes -->';
const endMarker = '<!-- /docs:template:web-routes -->';

const template = JSON.parse(await readFile(templatePath, 'utf8'));
const routes = [...template.routes];

if (template.includeLandingRoute && template.landingRoute) {
  routes.unshift(template.landingRoute);
}

function formatPathCell(path) {
  return path.includes('`') ? path : `\`${path}\``;
}

function formatRow(path, purpose) {
  const pathCell = formatPathCell(path).padEnd(42);
  const purposeCell = purpose.padEnd(46);
  return `| ${pathCell}| ${purposeCell} |`;
}

const table = [
  '| Path                                      | Purpose                                        |',
  '| ----------------------------------------- | ---------------------------------------------- |',
  ...routes.map(({ path, purpose }) => formatRow(path, purpose)),
].join('\n');

const routesDoc = await readFile(routesDocPath, 'utf8');
const start = routesDoc.indexOf(startMarker);
const end = routesDoc.indexOf(endMarker);

if (start === -1 || end === -1 || end <= start) {
  throw new Error(`Missing web route template markers in ${routesDocPath}`);
}

const nextDoc = `${routesDoc.slice(0, start + startMarker.length)}\n${table}\n${routesDoc.slice(end)}`;
await writeFile(routesDocPath, nextDoc);

console.log(
  `Synced Web & gateway routes (${routes.length} rows, landing ${template.includeLandingRoute ? 'included' : 'excluded'}).`
);