import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlFiles = fs.readdirSync(root).filter((name) => name.toLowerCase().endsWith('.html'));
const failures = [];
let inlineScriptsChecked = 0;
let localReferencesChecked = 0;
let idsChecked = 0;
let appShellPagesChecked = 0;
let sharedSidebarPagesChecked = 0;
let sharedTopbarPagesChecked = 0;

function reportFailure(file, message) {
  failures.push(`${file}: ${message}`);
}

function resolveLocalReference(fromFile, reference) {
  const value = reference.trim();
  if (!value || value.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return null;
  const withoutQuery = value.split(/[?#]/, 1)[0];
  if (!withoutQuery) return null;
  try {
    return path.resolve(root, path.dirname(fromFile), decodeURIComponent(withoutQuery));
  } catch {
    return path.resolve(root, path.dirname(fromFile), withoutQuery);
  }
}

for (const file of htmlFiles) {
  const fullPath = path.join(root, file);
  const html = fs.readFileSync(fullPath, 'utf8');

  if (!/<html\b/i.test(html) || !/<head\b/i.test(html) || !/<body\b/i.test(html)) {
    reportFailure(file, 'missing expected html/head/body structure');
  }

  // Catch malformed inline scripts without executing browser-dependent code.
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const attributes = match[1] ?? '';
    const source = (match[2] ?? '').trim();
    if (!source || /\btype\s*=\s*["'](?:application\/json|application\/ld\+json)["']/i.test(attributes)) continue;
    try {
      new vm.Script(source, { filename: `${file} inline script` });
      inlineScriptsChecked += 1;
    } catch (error) {
      reportFailure(file, `inline JavaScript parse error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Check actual markup and CSS, excluding JavaScript strings/templates that can
  // contain dynamic href/src values (for example Blob export links).
  const markupWithoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  const references = [
    ...[...markupWithoutScripts.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi)].map((match) => match[2]),
    ...[...markupWithoutScripts.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)].map((match) => match[2]),
  ];
  for (const reference of references) {
    const localPath = resolveLocalReference(file, reference);
    if (!localPath) continue;
    localReferencesChecked += 1;
    if (!fs.existsSync(localPath)) reportFailure(file, `broken local reference: ${reference}`);
  }

  // Guard against repeated IDs, a common source of broken modal/event behavior.
  const ids = [...markupWithoutScripts.matchAll(/\bid\s*=\s*(["'])(.*?)\1/gi)].map((match) => match[2]);
  const seen = new Set();
  const duplicates = new Set();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  idsChecked += ids.length;
  if (duplicates.size) reportFailure(file, `duplicate HTML IDs: ${[...duplicates].join(', ')}`);

  if (!html.includes('assets/css/design-system.css')) reportFailure(file, 'shared design system stylesheet is not included');
  if (!html.includes('assets/js/app.js')) reportFailure(file, 'compiled TypeScript UI layer is not included');

  const sidebarMounts = [...markupWithoutScripts.matchAll(/data-itglow-sidebar/gi)].length;
  if (sidebarMounts > 0) {
    sharedSidebarPagesChecked += 1;
    if (sidebarMounts !== 1) reportFailure(file, `expected one shared sidebar mount point, found ${sidebarMounts}`);
    const hasLegacySidebarClass = [...markupWithoutScripts.matchAll(/class=["']([^"']*)["']/gi)]
      .some((match) => (match[1] ?? '').split(/\s+/).includes('sidebar'));
    if (hasLegacySidebarClass) {
      reportFailure(file, 'legacy page-specific sidebar markup remains beside the shared sidebar mount');
    }
  }

  if (sidebarMounts > 0) {
    const topbarMounts = [...markupWithoutScripts.matchAll(/data-itglow-topbar/gi)].length;
    sharedTopbarPagesChecked += 1;
    if (topbarMounts !== 1) reportFailure(file, `expected one shared topbar mount point, found ${topbarMounts}`);
    const legacyTopbars = [...markupWithoutScripts.matchAll(/<header\b[^>]*class=["']([^"']*)["'][^>]*>/gi)]
      .filter((match) => (match[1] ?? '').split(/\s+/).includes('topbar')).length;
    if (legacyTopbars !== 0) reportFailure(file, `legacy page-specific topbar markup remains (${legacyTopbars})`);
    const sharedScript = html.indexOf('<script src="assets/js/app.js"></script>');
    const topbarMount = html.indexOf('data-itglow-topbar');
    if (sharedScript < 0 || sharedScript < topbarMount) {
      reportFailure(file, 'shared UI script must load after the shell mount points and before page scripts');
    }
  }

  if (/class=["'][^"']*\bapp-shell\b[^"']*["']/i.test(markupWithoutScripts)) {
    appShellPagesChecked += 1;
    const sharedCss = fs.readFileSync(path.join(root, 'assets', 'css', 'design-system.css'), 'utf8');
    if (!sharedCss.includes('.itg-sidebar') || !sharedCss.includes('.app-shell .page-content')) {
      reportFailure(file, 'shared design system does not cover the app-shell layout and shared sidebar');
    }
    const appSource = fs.readFileSync(path.join(root, 'src', 'app.ts'), 'utf8');
    if (!appSource.includes('.itg-sidebar__link[href]') || !appSource.includes('data-itglow-sidebar')) {
      reportFailure(file, 'shared TypeScript navigation renderer is missing');
    }
  }
}


const appSource = fs.existsSync(path.join(root, 'src', 'app.ts'))
  ? fs.readFileSync(path.join(root, 'src', 'app.ts'), 'utf8')
  : '';
const navigationConfig = appSource.match(/const navigationItems:[\s\S]*?= \[([\s\S]*?)\n  \];/);
if (navigationConfig) {
  const navigationPaths = [...navigationConfig[1].matchAll(/path:\s*"([^"]+)"/g)].map((match) => match[1]);
  for (const destination of navigationPaths) {
    if (!fs.existsSync(path.join(root, destination))) reportFailure('src/app.ts', `navigation route does not exist: ${destination}`);
  }
} else {
  reportFailure('src/app.ts', 'central type-safe navigation configuration was not found');
}

const tsSourcePath = path.join(root, 'src', 'app.ts');
const compiledPath = path.join(root, 'assets', 'js', 'app.js');
if (!fs.existsSync(tsSourcePath)) reportFailure('project', 'missing src/app.ts');
if (!fs.existsSync(compiledPath)) reportFailure('project', 'missing compiled assets/js/app.js; run npm run build');

if (failures.length) {
  console.error(`Project verification failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Project verification passed.`);
  console.log(`HTML pages checked: ${htmlFiles.length}`);
  console.log(`Inline JavaScript blocks parsed: ${inlineScriptsChecked}`);
  console.log(`Local references checked: ${localReferencesChecked}`);
  console.log(`HTML IDs checked for duplicates: ${idsChecked}`);
  console.log(`Shared sidebar mount pages checked: ${sharedSidebarPagesChecked}`);
  console.log(`Shared topbar mount pages checked: ${sharedTopbarPagesChecked}`);
  console.log(`Alternate app-shell layouts checked: ${appShellPagesChecked}`);
}
