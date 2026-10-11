import {test, expect, type BrowserContext, type Cookie, type Locator, type Page, type TestInfo} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import type {CaseDTO} from '../../apps/web/src/app/types';
import type {InboxItem, InboxList} from '../../apps/web/src/features/inbox/types';

// Existing records only. Login is the sole permitted write; nothing in this suite signs,
// submits intake, reviews a source, executes a payment or starts a financial worker.
const origin = process.env.SF_PROCESS_WEB_URL || 'http://127.0.0.1:5283';
const stages = ['Receive', 'Security', 'Finance', 'Decision', 'Payment', 'Report'];
const sizes = [
  {name: 'desktop', width: 1440, height: 1000},
  {name: 'tablet', width: 1024, height: 900},
  {name: 'mobile', width: 390, height: 844},
  {name: 'narrow', width: 320, height: 740},
];
type Camera = {position: number[]; rotation: number[]; zoom: number; drawCalls: number; orthographic: boolean};
let cookies: Cookie[] | undefined;
let blockedWrites: string[] = [];
let pageErrors: string[] = [];
let observations: Record<string, unknown> = {};

async function readOnlyGuard(context: BrowserContext) {
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.continue();
    if (request.method() === 'POST' && url.origin === new URL(origin).origin && url.pathname === '/api/v1/auth/demo') return route.continue();
    blockedWrites.push(`${request.method()} ${url.pathname}`);
    return route.abort('blockedbyclient');
  });
}

async function login(page: Page) {
  if (cookies) await page.context().addCookies(cookies);
  else {
    // APIRequestContext is not intercepted by browser routes. Its only POST is this
    // explicit exception; every other direct API call uses readJson's GET method.
    const response = await page.request.post(`${origin}/api/v1/auth/demo`, {headers: {Origin: new URL(origin).origin}});
    expect(response.status(), 'The copied local preview must permit the authorized demo sign-in').toBe(200);
    cookies = await page.context().cookies();
  }
  await page.goto('/operations');
  await expect(page.getByRole('heading', {level: 1, name: 'Follow the flow.'})).toBeVisible();
  await expect(page.getByLabel('Follow an item', {exact: true})).toBeEnabled();
}

async function readJson<T>(page: Page, path: string): Promise<T> {
  expect(path.startsWith('/api/v1/'), 'Direct data access must be a local API GET').toBe(true);
  const response = await page.request.get(`${origin}${path}`);
  expect(response.status(), `Read-only ${path}`).toBe(200);
  return response.json() as Promise<T>;
}

function navigation(page: Page) {return page.getByRole('navigation', {name: 'Process stages', exact: true});}
function inspector(page: Page) {return page.getByTestId('process-inspector');}
function stageButton(page: Page, index: number) {return navigation(page).getByRole('button').nth(index);}
async function fit(page: Page) {
  const dimensions = await page.evaluate(() => ({width: document.documentElement.scrollWidth, viewport: innerWidth}));
  expect(dimensions.width, 'The page must fit without horizontal scrolling').toBeLessThanOrEqual(dimensions.viewport + 1);
  const workspace = await page.getByRole('region', {name: 'Interactive process map'}).boundingBox();
  expect(workspace).not.toBeNull();
  expect(workspace!.x).toBeGreaterThanOrEqual(-1);
  expect(workspace!.x + workspace!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
}
async function capture(page: Page, info: TestInfo, label: string) {
  await fit(page);
  const slug = info.titlePath.join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const directory = join('var/process-map-qa', info.project.name, slug);
  mkdirSync(directory, {recursive: true, mode: 0o700});
  await page.screenshot({path: join(directory, `${label}.png`), fullPage: true, animations: 'disabled'});
}
async function camera(canvas: Locator): Promise<Camera> {
  return JSON.parse(await canvas.getAttribute('data-camera') || '{}') as Camera;
}
const separation = (a: number[], b: number[]) => Math.hypot(...a.map((value, index) => value - b[index]!));
async function renderedMap(page: Page) {
  const canvas = page.getByTestId('campus-canvas').locator('canvas');
  await expect(canvas, 'Normal browser runs must render real WebGL geometry').toBeVisible();
  await expect.poll(async () => (await camera(canvas)).drawCalls || 0).toBeGreaterThan(0);
  const state = await camera(canvas);
  expect(state.orthographic).toBe(true);
  expect(state.position).toHaveLength(3);
  expect([...state.position, ...state.rotation, state.zoom].every(Number.isFinite)).toBe(true);
  expect(state.zoom).toBeGreaterThan(0);
  return canvas;
}
async function settledCamera(canvas: Locator) {
  let previous = await camera(canvas);
  let stableSamples = 0;
  await expect.poll(async () => {
    const next = await camera(canvas);
    stableSamples = separation(next.position, previous.position) < .003 && Math.abs(next.zoom - previous.zoom) < .003 ? stableSamples + 1 : 0;
    previous = next;
    return stableSamples;
  }, {intervals: [150, 200, 250]}).toBeGreaterThanOrEqual(2);
  return previous;
}
async function selectRecord(page: Page, value: string) {
  const select = page.getByLabel('Follow an item', {exact: true});
  await expect.poll(() => select.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).toContain(value);
  await select.selectOption(value);
  await expect(select).toHaveValue(value);
  await expect(page.getByTestId('process-outcome')).toBeVisible();
}

// Derive the acceptance oracle directly from saved API facts, not the UI projection.
// A policy receipt must identify this exact invoice and transaction. A human-route
// SETTLED record must also carry its stored settlement receipt reference.
function recordedPayment(invoice: CaseDTO) {
  if (invoice.paymentRoute === 'REGISTERED_POLICY') {
    const payment = invoice.automationPayment;
    const verified = payment?.settlementStatus === 'SETTLED' && payment.executionStatus === 'CONFIRMED'
      && !!payment.txHash && payment.receipt?.transactionHash === payment.txHash && payment.receipt.invoiceKey === invoice.invoiceKey;
    return {verified, execution: payment?.executionStatus === 'CONFIRMED' && !verified ? 'INCONSISTENT' : payment?.executionStatus || 'NONE', route: 'registered policy'};
  }
  if (invoice.settlementStatus === 'SETTLED') expect(invoice.settlement?.txHash, 'A saved paid invoice needs a recorded settlement reference').toBeTruthy();
  return {verified: invoice.settlementStatus === 'SETTLED', execution: invoice.executionStatus, route: 'wallet approval'};
}

test.beforeEach(async ({page, context}) => {
  blockedWrites = [];
  pageErrors = [];
  observations = {};
  await readOnlyGuard(context);
  page.on('pageerror', error => pageErrors.push(error.message));
});
test.afterEach(async ({page, browser}, info) => {
  expect.soft(blockedWrites, 'No data or transaction mutation may even be attempted').toEqual([]);
  expect.soft(pageErrors, 'No uncaught browser errors, including fallback handling').toEqual([]);
  await info.attach('read-only-observations', {
    body: JSON.stringify({browser: browser.version(), viewport: page.viewportSize(), blockedWrites, pageErrors, scope: 'Saved records and local login only; no financial or intake actions.', ...observations}, null, 2),
    contentType: 'application/json',
  });
});

for (const size of sizes) {
  test.describe(`${size.name} ${size.width}×${size.height}`, () => {
    test.use({viewport: {width: size.width, height: size.height}});

    test('six stations support inspection, sequential navigation and closing', async ({page}, info) => {
      await login(page);
      await renderedMap(page);
      const buttons = navigation(page).getByRole('button');
      await expect(buttons).toHaveCount(6);
      await expect(page.locator('.pm-node')).toHaveCount(6);
      await expect(page.getByLabel('Follow an item', {exact: true})).toHaveValue('');
      await capture(page, info, 'overview');
      for (let index = 0; index < stages.length; index++) {
        await expect(buttons.nth(index)).toHaveAccessibleName(`${index + 1}. ${stages[index]}`);
        await buttons.nth(index).click();
        await expect(inspector(page).getByRole('heading', {name: stages[index], exact: true})).toBeVisible();
        await expect(buttons.nth(index)).toHaveAttribute('aria-pressed', 'true');
        await expect(navigation(page).locator('[aria-pressed="true"]')).toHaveCount(1);
        await fit(page);
      }
      await expect(inspector(page).getByRole('button', {name: 'Next stage'})).toBeDisabled();
      await inspector(page).getByRole('button', {name: 'Previous stage'}).click();
      await expect(inspector(page).getByRole('heading', {name: 'Payment', exact: true})).toBeVisible();
      await inspector(page).getByRole('button', {name: 'Next stage'}).click();
      await expect(inspector(page).getByRole('heading', {name: 'Report', exact: true})).toBeVisible();
      await buttons.first().click();
      await expect(inspector(page).getByRole('button', {name: 'Previous stage'})).toBeDisabled();
      await capture(page, info, 'stage-inspector');
      await inspector(page).getByRole('button', {name: 'Close stage details'}).click();
      await expect(inspector(page)).toHaveCount(0);
      await expect(navigation(page).locator('.pm-step[data-stage="receive"]')).toBeFocused();
      await expect(navigation(page).locator('[aria-pressed="true"]')).toHaveCount(0);
      // The HTML station overlay is independently interactive, not just decorative.
      await page.locator('.pm-node[data-stage="security"]').click();
      await expect(inspector(page).getByRole('heading', {name: 'Security', exact: true})).toBeVisible();
      await fit(page);
      await inspector(page).getByRole('button', {name: 'Close stage details'}).focus();
      await page.keyboard.press('Escape');
      await expect(inspector(page)).toHaveCount(0);
      await expect(navigation(page).locator('.pm-step[data-stage="security"]')).toBeFocused();
    });

    test('camera controls change the actual camera and retain stage interaction', async ({page}, info) => {
      await login(page);
      const canvas = await renderedMap(page);
      const baseline = await settledCamera(canvas);
      await page.getByRole('button', {name: 'Zoom in', exact: true}).click();
      await expect.poll(async () => (await camera(canvas)).zoom).toBeGreaterThan(baseline.zoom * 1.05);
      const zoomed = await settledCamera(canvas);
      await page.getByRole('button', {name: 'Zoom out', exact: true}).click();
      await expect.poll(async () => (await camera(canvas)).zoom).toBeLessThan(zoomed.zoom * .95);
      const beforeRotate = await settledCamera(canvas);
      await page.getByRole('button', {name: 'Rotate right', exact: true}).click();
      await expect.poll(async () => separation((await camera(canvas)).position, beforeRotate.position)).toBeGreaterThan(1);
      const rotated = await settledCamera(canvas);
      await page.getByRole('button', {name: 'Rotate left', exact: true}).click();
      await expect.poll(async () => separation((await camera(canvas)).position, rotated.position)).toBeGreaterThan(1);
      await settledCamera(canvas);
      await page.getByRole('button', {name: 'Zoom in', exact: true}).click();
      await settledCamera(canvas);
      await page.getByRole('button', {name: 'Fit map', exact: true}).click();
      await expect.poll(async () => {
        const current = await camera(canvas);
        return separation(current.position, baseline.position) < .1 && Math.abs(current.zoom - baseline.zoom) < .1;
      }).toBe(true);
      const before2D = await settledCamera(canvas);
      await page.getByRole('button', {name: '2D', exact: true}).click();
      await expect(page.locator('.pm-scene')).toHaveAttribute('data-view-mode', '2d');
      await expect(page.getByRole('button', {name: '2D', exact: true})).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(async () => separation((await camera(canvas)).position, before2D.position)).toBeGreaterThan(1);
      await settledCamera(canvas);
      await stageButton(page, 2).click();
      await expect(inspector(page).getByRole('heading', {name: 'Finance', exact: true})).toBeVisible();
      await inspector(page).getByRole('button', {name: 'Close stage details'}).click();
      await page.getByRole('button', {name: '3D', exact: true}).click();
      await expect(page.locator('.pm-scene')).toHaveAttribute('data-view-mode', '3d');
      await expect.poll(async () => separation((await camera(canvas)).position, before2D.position)).toBeLessThan(.1);
      await stageButton(page, 4).click();
      await expect(inspector(page).getByRole('heading', {name: 'Payment', exact: true})).toBeVisible();
      const beforeFocus = await settledCamera(canvas);
      await inspector(page).getByRole('button', {name: 'Focus station', exact: true}).click();
      await expect.poll(async () => {
        const current = await camera(canvas);
        return separation(current.position, beforeFocus.position) > 1 && current.zoom > beforeFocus.zoom * 1.05;
      }).toBe(true);
      await page.getByRole('button', {name: 'Pause scene motion', exact: true}).click();
      await expect(page.getByRole('button', {name: 'Resume scene motion', exact: true})).toBeVisible();
      await stageButton(page, 5).click();
      await expect(inspector(page).getByRole('heading', {name: 'Report', exact: true})).toBeVisible();
      await page.getByRole('button', {name: 'Resume scene motion', exact: true}).click();
      await expect(page.getByRole('button', {name: 'Pause scene motion', exact: true})).toBeVisible();
      observations = {initialCamera: baseline, focusedCamera: await camera(canvas), cameraCommandsVerified: ['zoom in', 'zoom out', 'rotate right', 'rotate left', 'fit', '2D', '3D', 'focus'], pauseToggleVerified: true};
      await capture(page, info, 'focused-map');
    });

    test('a saved inbox source has recorded stages and opens its own review', async ({page}, info) => {
      await login(page);
      const {items} = await readJson<InboxList>(page, '/api/v1/inbox?limit=100');
      const source = items.find(item => item.status === 'quarantined') || items.find(item => item.stages.length > 0);
      expect(source, 'The copied preview must already contain a recorded source; QA never creates it').toBeTruthy();
      await selectRecord(page, `item:${source!.id}`);
      const classificationStatus = source!.stages.find(stage => stage.id === 'classification')?.status;
      const receiveStatus = ['held', 'failed'].includes(classificationStatus || '') ? 'attention' : ['running', 'pending'].includes(classificationStatus || '') ? 'active' : 'complete';
      await expect(stageButton(page, 0)).toHaveClass(new RegExp(`pm-status-${receiveStatus}`));
      if (source!.status === 'quarantined') {
        await expect(stageButton(page, 1)).toHaveClass(/pm-status-attention/);
        await expect(stageButton(page, 2)).toHaveClass(/pm-status-waiting/);
        await expect(stageButton(page, 3)).toHaveClass(/pm-status-waiting/);
      }
      await stageButton(page, 1).click();
      await expect(inspector(page).getByRole('heading', {name: 'Security', exact: true})).toBeVisible();
      await inspector(page).getByText('What this means', {exact: true}).click();
      await expect(inspector(page).locator('details')).toHaveAttribute('open', '');
      await capture(page, info, 'saved-source-security');
      await inspector(page).getByRole('button', {name: 'Open review', exact: true}).click();
      await expect.poll(() => new URL(page.url()).pathname).toBe(`/inbox/${source!.id}`);
      await expect(page.getByRole('heading', {level: 1, name: source!.title, exact: true})).toBeVisible();
      observations = {sourceStatus: source!.status, recordedStages: source!.stages.map(stage => ({id: stage.id, status: stage.status})), reviewLinkMatchesSource: true};
    });

    test('saved invoice payment and report stages follow receipt records', async ({page}, info) => {
      await login(page);
      const [{cases}, {items}] = await Promise.all([
        readJson<{cases: CaseDTO[]}>(page, '/api/v1/cases'),
        readJson<InboxList>(page, '/api/v1/inbox?limit=100'),
      ]);
      const paid = cases.find(invoice => recordedPayment(invoice).verified);
      expect(paid, 'The copied preview must contain a previously verified settlement; this test makes no payment').toBeTruthy();
      const unpaid = cases.find(invoice => !recordedPayment(invoice).verified);
      const saved = [paid!, ...(unpaid ? [unpaid] : [])];
      const observed: unknown[] = [];
      for (const invoice of saved) {
        const linked = items.find(item => item.linkedCaseId === invoice.id);
        await selectRecord(page, linked ? `item:${linked.id}` : `case:${invoice.id}`);
        const facts = recordedPayment(invoice);
        await stageButton(page, 4).click();
        await expect(inspector(page).getByRole('heading', {name: 'Payment', exact: true})).toBeVisible();
        if (facts.verified) {
          await expect(stageButton(page, 4)).toHaveClass(/pm-status-complete/);
          await expect(inspector(page).locator('.pm-stage-badge')).toHaveText('Recorded');
        } else {
          await expect(stageButton(page, 4)).not.toHaveClass(/pm-status-complete/);
          if (['UNKNOWN', 'INCONSISTENT', 'REVERTED', 'HELD'].includes(facts.execution)) await expect(stageButton(page, 4)).toHaveClass(/pm-status-attention/);
          if (['PREPARING', 'PREPARED', 'SUBMITTED', 'PENDING'].includes(facts.execution)) await expect(stageButton(page, 4)).toHaveClass(/pm-status-active/);
        }
        await capture(page, info, facts.verified ? 'verified-payment' : 'unsettled-payment');
        await inspector(page).getByRole('button', {name: 'Next stage'}).click();
        await expect(inspector(page).getByRole('heading', {name: 'Report', exact: true})).toBeVisible();
        // A reading report is available even when payment is not verified.
        await expect(stageButton(page, 5)).toHaveClass(/pm-status-complete/);
        await inspector(page).getByText('What this means', {exact: true}).click();
        await expect(inspector(page).locator('details')).toHaveAttribute('open', '');
        await expect(inspector(page).locator('details')).toContainText(/payment/i);
        await capture(page, info, facts.verified ? 'settled-report' : 'unsettled-report');
        observed.push({route: facts.route, execution: facts.execution, verifiedReceipt: facts.verified, reportAvailable: true});
      }
      observations = {savedInvoiceBaselines: observed, unpaidBaselineAvailable: !!unpaid};
    });

    test('no WebGL gives an inspectable six-stage fallback and safe retry', async ({page}, info) => {
      await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
          if (/^(webgl2?|experimental-webgl)$/.test(kind)) return null;
          return Reflect.apply(original, this, [kind, ...args]);
        } as typeof original;
      });
      await login(page);
      const fallback = page.getByTestId('process-fallback');
      await expect(fallback).toBeVisible();
      await expect(page.getByTestId('campus-canvas')).toHaveCount(0);
      await expect(fallback.locator('ol').getByRole('button')).toHaveCount(6);
      await expect(page.getByRole('button', {name: '2D', exact: true})).toBeDisabled();
      await expect(page.getByRole('button', {name: '3D', exact: true})).toBeDisabled();
      for (let index = 0; index < stages.length; index++) {
        await fallback.locator('ol').getByRole('button').nth(index).click();
        await expect(inspector(page).getByRole('heading', {name: stages[index], exact: true})).toBeVisible();
        await expect(stageButton(page, index)).toHaveAttribute('aria-pressed', 'true');
        await fit(page);
      }
      await expect(inspector(page).getByRole('button', {name: 'Focus station', exact: true})).toHaveCount(0);
      await fallback.getByRole('button', {name: 'Retry 3D', exact: true}).click();
      await expect(fallback).toBeVisible();
      await stageButton(page, 0).click();
      await inspector(page).getByRole('button', {name: 'Next stage'}).click();
      await expect(inspector(page).getByRole('heading', {name: 'Security', exact: true})).toBeVisible();
      await capture(page, info, 'no-webgl');
      observations = {forcedWebGLUnavailable: true, fallbackStages: 6, retryRemainsUsable: true};
    });
  });
}

test('an inbox GET failure can retry without hiding saved invoice cases', async ({page}, info) => {
  let failInbox = true;
  let failures = 0;
  await page.route('**/api/v1/inbox?*', async route => {
    if (new URL(route.request().url()).pathname === '/api/v1/inbox' && route.request().method() === 'GET' && failInbox) {
      failures++;
      await route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: 'QA_READ_UNAVAILABLE', message: 'Temporary read failure injected by read-only QA.'})});
    } else await route.fallback();
  });
  await login(page);
  const notice = page.getByRole('alert').filter({hasText: 'Inbox journeys could not load'});
  await expect(notice).toBeVisible();
  const {cases} = await readJson<{cases: CaseDTO[]}>(page, '/api/v1/cases');
  expect(cases.length, 'Saved invoice records are required for the independent fallback').toBeGreaterThan(0);
  await selectRecord(page, `case:${cases[0]!.id}`);
  await stageButton(page, 4).click();
  await expect(inspector(page).getByRole('heading', {name: 'Payment', exact: true})).toBeVisible();
  await capture(page, info, 'inbox-read-failed');
  failInbox = false;
  const recovered = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/inbox' && response.request().method() === 'GET' && response.ok());
  await notice.getByRole('button', {name: 'Try again', exact: true}).click();
  await recovered;
  await expect(notice).toHaveCount(0);
  const {items} = await readJson<InboxList>(page, '/api/v1/inbox?limit=100');
  expect(items.length, 'Saved inbox records must be restored without creating new ones').toBeGreaterThan(0);
  await selectRecord(page, `item:${items[0]!.id}`);
  await capture(page, info, 'inbox-read-recovered');
  observations = {injectedGetFailures: failures, invoiceCasesAvailableDuringFailure: true, inboxRecovered: true};
});

// Additional desktop checks can be run independently with --grep "extended process map".
// They deliberately leave the original read-only acceptance cases unchanged.
test('extended process map: drag, model selection and fullscreen controls work', async ({page}, info) => {
  await login(page);
  const canvas = await renderedMap(page);
  const baseline = await settledCamera(canvas);
  const box = (await canvas.boundingBox())!;
  // Start on the canvas itself, clear of the HTML labels and camera toolbar.
  const start = await canvas.evaluate(element => {
    const rect = element.getBoundingClientRect();
    for (const [x, y] of [[.18, .73], [.78, .68], [.2, .3], [.5, .5]]) {
      const point = {x: rect.left + rect.width * x!, y: rect.top + rect.height * y!};
      if (document.elementFromPoint(point.x, point.y) === element) return point;
    }
    return null;
  });
  expect(start, 'A visible canvas surface is required for a real pointer drag').not.toBeNull();
  await page.mouse.move(start!.x, start!.y);
  await page.mouse.down();
  await page.mouse.move(start!.x + Math.min(90, box.width * .12), start!.y - 45, {steps: 12});
  await page.mouse.up();
  await expect.poll(async () => separation((await camera(canvas)).position, baseline.position)).toBeGreaterThan(.5);
  const panned = await settledCamera(canvas);
  expect(Math.abs(panned.zoom - baseline.zoom), 'Dragging pans without changing the zoom').toBeLessThan(.05);
  // A drag must not be mistaken for a station click.
  await expect(inspector(page)).toHaveCount(0);
  await page.getByRole('button', {name: 'Fit map', exact: true}).click();
  await expect.poll(async () => {
    const next = await camera(canvas);
    return separation(next.position, baseline.position) < .1 && Math.abs(next.zoom - baseline.zoom) < .1;
  }).toBe(true);

  // Project the center of the Security platform using the actual camera telemetry,
  // then click its canvas pixels. This exercises Three's geometry picking, not the label.
  const {OrthographicCamera, Vector3} = await import('three');
  const actual = await settledCamera(canvas);
  const bounds = (await canvas.boundingBox())!;
  const projection = new OrthographicCamera(-bounds.width / 2, bounds.width / 2, bounds.height / 2, -bounds.height / 2, .1, 400);
  projection.position.fromArray(actual.position);
  projection.rotation.set(actual.rotation[0]!, actual.rotation[1]!, actual.rotation[2]!);
  projection.zoom = actual.zoom;
  projection.updateProjectionMatrix();
  projection.updateMatrixWorld();
  const projected = new Vector3(0, .8, -6).project(projection);
  const target = {x: bounds.x + (projected.x + 1) * bounds.width / 2, y: bounds.y + (1 - projected.y) * bounds.height / 2};
  expect(await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.tagName, target), 'The geometry selection point must hit canvas rather than a label').toBe('CANVAS');
  await page.mouse.click(target.x, target.y);
  await expect(inspector(page).getByRole('heading', {name: 'Security', exact: true})).toBeVisible();
  await inspector(page).getByRole('button', {name: 'Close stage details'}).click();
  await settledCamera(canvas);
  await page.locator('.pm-node[data-stage="payment"]').click();
  await expect(inspector(page).getByRole('heading', {name: 'Payment', exact: true})).toBeVisible();
  await inspector(page).getByRole('button', {name: 'Close stage details'}).click();

  const enter = page.getByRole('button', {name: 'Full screen map', exact: true});
  let fullscreenResult = 'not supported by the platform';
  if (await enter.count()) {
    await enter.click();
    await expect.poll(async () => {
      if (await page.evaluate(() => !!document.fullscreenElement)) return 'entered';
      if (await page.getByRole('status').filter({hasText: 'Full screen is unavailable'}).isVisible()) return 'explained refusal';
      return 'pending';
    }).not.toBe('pending');
    if (await page.evaluate(() => !!document.fullscreenElement)) {
      expect(await page.evaluate(() => document.fullscreenElement?.classList.contains('pm-page'))).toBe(true);
      await expect(page.getByRole('button', {name: 'Exit full screen', exact: true})).toBeVisible();
      await capture(page, info, 'fullscreen');
      await page.getByRole('button', {name: 'Exit full screen', exact: true}).click();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
      fullscreenResult = 'entered and exited';
    } else {
      await expect(page.getByRole('status').filter({hasText: 'Full screen is unavailable'})).toBeVisible();
      fullscreenResult = 'platform refusal explained';
    }
  } else {
    expect(await page.evaluate(() => typeof document.documentElement.requestFullscreen)).not.toBe('function');
  }
  await page.getByRole('button', {name: 'Fit map', exact: true}).click();
  await settledCamera(canvas);
  await stageButton(page, 5).click();
  await expect(inspector(page).getByRole('heading', {name: 'Report', exact: true})).toBeVisible();
  await capture(page, info, 'drag-and-selection');
  observations = {dragChangedPosition: separation(panned.position, baseline.position), fitRestoredCamera: true, canvasGeometrySelected: 'Security', labelSelected: 'Payment', fullscreen: fullscreenResult};
});

test('extended process map: pause and reduced motion stop rendered animation frames', async ({page}, info) => {
  await login(page);
  const [{cases}, {items}] = await Promise.all([
    readJson<{cases: CaseDTO[]}>(page, '/api/v1/cases'),
    readJson<InboxList>(page, '/api/v1/inbox?limit=100'),
  ]);
  const source = items.find(item => cases.some(invoice => invoice.id === item.linkedCaseId && recordedPayment(invoice).verified));
  expect(source, 'A saved source linked to a verified settlement is required; no payment is created').toBeTruthy();
  const value = `item:${source!.id}`;
  await selectRecord(page, value);
  await expect(stageButton(page, 4)).toHaveClass(/pm-status-complete/);
  let canvas = await renderedMap(page);
  const frame = async () => {
    const count = (await camera(canvas) as Camera & {frame: number}).frame;
    expect(Number.isInteger(count), 'The scene must expose its actual rendered frame counter').toBe(true);
    return count;
  };
  // Observe a continuous quiet interval after any camera or React transition settles.
  // Polling restarts the interval on every new rendered frame; no fixed sleep can pass it.
  const waitForStaticFrames = async () => {
    let previous = await frame();
    let unchangedSince = Date.now();
    await expect.poll(async () => {
      const current = await frame();
      if (current !== previous) {previous = current; unchangedSince = Date.now();}
      return Date.now() - unchangedSince;
    }, {timeout: 10_000, intervals: [100]}).toBeGreaterThanOrEqual(1000);
    return previous;
  };
  await settledCamera(canvas);
  const initial = await frame();
  await expect.poll(frame).toBeGreaterThan(initial + 2);
  await page.getByRole('button', {name: 'Pause scene motion', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Resume scene motion', exact: true})).toBeVisible();
  const pausedFrame = await waitForStaticFrames();
  await page.getByRole('button', {name: 'Resume scene motion', exact: true}).click();
  await expect.poll(frame).toBeGreaterThan(pausedFrame + 2);
  const resumedFrame = await frame();

  // Navigate through the application so the preference remains in the same session.
  // Returning to Operations mounts a new scene, which must also respect the preference.
  const primary = page.getByRole('navigation', {name: 'Primary navigation', exact: true});
  await primary.getByRole('link', {name: 'Settings', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Workspace settings.', exact: true})).toBeVisible();
  await expect(page.getByRole('checkbox', {name: /Pause campus animation/})).not.toBeChecked();
  await page.getByRole('checkbox', {name: /Reduce motion/}).check();
  await expect(page.getByRole('checkbox', {name: /Reduce motion/})).toBeChecked();
  await primary.getByRole('link', {name: 'Operations campus', exact: true}).click();
  await selectRecord(page, value);
  canvas = await renderedMap(page);
  await expect(stageButton(page, 4)).toHaveClass(/pm-status-complete/);
  await expect(page.getByRole('button', {name: 'Motion reduced in Settings', exact: true})).toBeDisabled();
  await settledCamera(canvas);
  const reducedFrame = await waitForStaticFrames();
  await capture(page, info, 'reduced-motion');
  await primary.getByRole('link', {name: 'Settings', exact: true}).click();
  await expect(page.getByRole('checkbox', {name: /Reduce motion/})).toBeChecked();
  await page.getByRole('checkbox', {name: /Reduce motion/}).uncheck();
  observations = {verifiedSavedSource: true, activeFrame: initial, pausedFrame, resumedFrame, reducedFrame, staticObservationWindowMs: 1000, preferencePreservedAcrossSceneRemount: true};
});

test('extended process map: labels fit both views and context loss keeps the process usable', async ({page}, info) => {
  test.setTimeout(90_000);
  await login(page);
  const canvas = await renderedMap(page);
  const measurements: unknown[] = [];
  const measure = () => page.locator('.pm-scene').evaluate(scene => {
    const rect = scene.getBoundingClientRect();
    const nodes = Array.from(scene.querySelectorAll<HTMLElement>('.pm-node')).map(node => {
      const box = node.getBoundingClientRect();
      return {stage: node.dataset.stage, left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height};
    });
    const issues: string[] = [];
    for (const node of nodes) {
      if (node.width <= 0 || node.height <= 0) issues.push(`${node.stage}: no visible bounds`);
      if (node.left < rect.left - 1 || node.right > rect.right + 1 || node.top < rect.top - 1 || node.bottom > rect.bottom + 1) issues.push(`${node.stage}: outside the scene`);
    }
    for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
      const first = nodes[a]!, second = nodes[b]!;
      const width = Math.min(first.right, second.right) - Math.max(first.left, second.left);
      const height = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
      if (width > 1 && height > 1) issues.push(`${first.stage} and ${second.stage}: labels overlap`);
    }
    return {nodes, issues, scene: {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom}};
  });
  for (const size of sizes) {
    await page.setViewportSize({width: size.width, height: size.height});
    for (const mode of ['3D', '2D']) {
      await page.getByRole('button', {name: mode, exact: true}).click();
      await expect(page.locator('.pm-scene')).toHaveAttribute('data-view-mode', mode.toLowerCase());
      await page.getByRole('button', {name: 'Fit map', exact: true}).click();
      await settledCamera(canvas);
      await expect(page.locator('.pm-node')).toHaveCount(6);
      await expect.poll(async () => (await measure()).issues, {message: `${size.name} ${mode} labels must fit and not overlap`}).toEqual([]);
      measurements.push({viewport: size.name, mode, ...(await measure())});
      observations = {layoutMeasurements: measurements};
      await capture(page, info, `labels-${size.name}-${mode.toLowerCase()}`);
    }
  }
  // Exercise the live context-loss event listener after successful rendering. This is
  // distinct from the startup probe returning null in the existing fallback tests.
  const dispatched = await canvas.evaluate(element => element.dispatchEvent(new Event('webglcontextlost', {cancelable: true})));
  expect(dispatched, 'The context-loss listener must prevent the default event and show its fallback').toBe(false);
  const fallback = page.getByTestId('process-fallback');
  await expect(fallback).toBeVisible();
  await expect(page.getByTestId('campus-canvas')).toHaveCount(0);
  await expect(fallback.locator('ol').getByRole('button')).toHaveCount(6);
  for (let index = 0; index < stages.length; index++) {
    await stageButton(page, index).click();
    await expect(inspector(page).getByRole('heading', {name: stages[index], exact: true})).toBeVisible();
  }
  await capture(page, info, 'context-loss-fallback');
  observations = {layoutMeasurements: measurements, contextLossHandled: true, accessibleStagesAfterLoss: 6};
});

test('extended process map: focused station survives a subsequent viewport resize', async ({page}, info) => {
  await page.setViewportSize({width: 1440, height: 1000});
  await login(page);
  const canvas = await renderedMap(page);
  const {Euler, Vector3} = await import('three');
  // The middle of each platform's framing bounds is y=3.25. Intersect the
  // camera's center ray with that plane to measure its actual look-at endpoint.
  // Payment is at (0, 7) on the desktop map; overview instead centers on (0, .5).
  const lookAt = async () => {
    const state = await camera(canvas);
    const direction = new Vector3(0, 0, -1).applyEuler(new Euler(state.rotation[0]!, state.rotation[1]!, state.rotation[2]!));
    const distance = (3.25 - state.position[1]!) / direction.y;
    expect(Number.isFinite(distance) && distance > 0, 'The camera must face the station plane').toBe(true);
    return new Vector3().fromArray(state.position).addScaledVector(direction, distance).toArray();
  };
  await stageButton(page, 4).click();
  await expect(inspector(page).getByRole('heading', {name: 'Payment', exact: true})).toBeVisible();
  await settledCamera(canvas);
  await inspector(page).getByRole('button', {name: 'Focus station', exact: true}).click();
  await expect.poll(async () => separation(await lookAt(), [0, 3.25, 7])).toBeLessThan(.1);
  const focused = await settledCamera(canvas);
  const originalWidth = (await canvas.boundingBox())!.width;

  await page.setViewportSize({width: 1380, height: 1000});
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeLessThan(originalWidth - 20);
  await expect(inspector(page).getByRole('heading', {name: 'Payment', exact: true})).toBeVisible();
  // Require a sustained correct endpoint after the real resize. An intermediate
  // focused frame before a late ResizeObserver callback must not satisfy this check.
  let correctSince = Date.now();
  await expect.poll(async () => {
    if (separation(await lookAt(), [0, 3.25, 7]) >= .1) correctSince = Date.now();
    return Date.now() - correctSince;
  }, {timeout: 12_000, intervals: [100]}).toBeGreaterThanOrEqual(1000);
  const resized = await settledCamera(canvas);
  await capture(page, info, 'focused-after-real-resize');
  await page.getByRole('button', {name: 'Fit map', exact: true}).click();
  await expect.poll(async () => separation(await lookAt(), [0, 3.25, .5])).toBeLessThan(.1);
  await expect(inspector(page).getByRole('heading', {name: 'Payment', exact: true})).toBeVisible();
  observations = {originalViewport: 1440, resizedViewport: 1380, selectedStage: 'Payment', focusedCamera: focused, resizedCamera: resized, focusedEndpointAfterResize: [0, 3.25, 7], stableEndpointWindowMs: 1000, explicitFitRestoresOverview: true};
});

test('extended process map: selected source survives list pagination and detail retry', async ({page}, info) => {
  await login(page);
  const {items} = await readJson<InboxList>(page, '/api/v1/inbox?limit=100');
  const source = items.find(item => item.status === 'quarantined') || items[0];
  expect(source, 'A recorded source must already exist; pagination QA creates no source').toBeTruthy();
  const value = `item:${source!.id}`;
  const detailPath = `/api/v1/inbox/${source!.id}`;
  const title = source!.title.replace(/0x[a-fA-F0-9]{8,64}/g, '[reference]');
  const picker = page.getByLabel('Follow an item', {exact: true});
  const outcome = page.getByTestId('process-outcome');
  const stageStates = () => navigation(page).getByRole('button').evaluateAll(buttons => buttons.map(button => ({
    stage: button.getAttribute('data-stage'),
    status: Array.from(button.classList).find(name => name.startsWith('pm-status-')),
  })));
  await selectRecord(page, value);
  await stageButton(page, 1).click();
  await expect(inspector(page).getByRole('heading', {name: 'Security', exact: true})).toBeVisible();
  await expect(outcome.locator('strong')).toHaveText(title);
  const originalStages = await stageStates();
  let filteredLists = 0;
  let detailFailures = 0;
  let failDetail = true;

  // Change only the browser's GET response, as if this source fell outside the latest
  // 100 entries. The saved record and its server-side position are never changed.
  await page.route('**/api/v1/inbox?*', async route => {
    if (route.request().method() !== 'GET' || new URL(route.request().url()).pathname !== '/api/v1/inbox') return route.fallback();
    const response = await route.fetch();
    const payload = await response.json() as InboxList;
    filteredLists++;
    await route.fulfill({response, json: {...payload, items: payload.items.filter(item => item.id !== source!.id)}});
  });
  await page.route(`**${detailPath}`, async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    if (!failDetail) return route.fallback();
    detailFailures++;
    await route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: 'QA_DETAIL_UNAVAILABLE', message: 'Temporary read-only detail failure.'})});
  });
  // Wait for the application's normal list refresh; no internal query-store mutation.
  await expect.poll(() => filteredLists, {timeout: 20_000}).toBeGreaterThan(0);
  const pinned = picker.locator('optgroup[label="Selected item"] option');
  await expect(pinned).toHaveAttribute('value', value);
  await expect(picker).toHaveValue(value);
  const notice = page.getByRole('alert').filter({hasText: 'This item could not refresh. Showing its last recorded state.'});
  await expect(notice).toBeVisible();
  expect(detailFailures).toBeGreaterThan(0);
  await expect(outcome.locator('strong')).toHaveText(title);
  await expect(outcome.getByRole('button', {name: 'Open review', exact: true})).toBeEnabled();
  await expect.poll(stageStates).toEqual(originalStages);
  await expect(stageButton(page, 5)).toHaveClass(/pm-status-complete/);
  await capture(page, info, 'selected-source-cached-after-pagination');

  const retry = notice.getByRole('button', {name: 'Retry selected item', exact: true});
  await expect(retry).toBeEnabled();
  failDetail = false;
  const recovered = page.waitForResponse(response => new URL(response.url()).pathname === detailPath && response.request().method() === 'GET' && response.ok());
  await retry.click();
  await recovered;
  await expect(notice).toHaveCount(0);
  await expect(pinned).toHaveAttribute('value', value);
  await expect(picker).toHaveValue(value);
  await expect(outcome.locator('strong')).toHaveText(title);
  await expect.poll(stageStates).toEqual(originalStages);
  await capture(page, info, 'selected-source-detail-recovered');
  await outcome.getByRole('button', {name: 'Open review', exact: true}).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/inbox/${source!.id}`);
  await expect(page.getByRole('heading', {level: 1, name: source!.title, exact: true})).toBeVisible();
  observations = {filteredListReads: filteredLists, injectedDetailFailures: detailFailures, retainedSourceStatus: source!.status, cachedStagesPreserved: true, pinnedOptionRetained: true, detailRetryRecovered: true, originalReviewTargetPreserved: true};
});
