/**
 * Shared Playwright configuration: five projects (desktop Chromium, Firefox, WebKit, iPhone and
 * Pixel emulation), fully parallel, one web server, deterministic screenshot settings.
 *
 * Environment:
 *   E2E_PORT              port of the server under test
 *   E2E_EXTERNAL_SERVER=1 do not start a server (run-e2e.mjs already started one)
 *   E2E_WORKERS           workers per Playwright process (default 50%)
 *   E2E_BROWSERS          comma list of project names to run, e.g. "chromium,pixel"
 *   E2E_IPHONE_ENGINE     "chromium" runs the iPhone project on Chromium (when WebKit is missing)
 */
import { devices, type PlaywrightTestConfig, type Project } from '@playwright/test';

/** Software WebGL for headless Chromium (no GPU on CI hosts). */
export const CHROMIUM_GL_ARGS: readonly string[] = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

export type KitProjectName = 'chromium' | 'firefox' | 'webkit' | 'iphone' | 'pixel';

export const KIT_PROJECT_NAMES: readonly KitProjectName[] = [
  'chromium',
  'firefox',
  'webkit',
  'iphone',
  'pixel',
];

export function kitProjects(env: NodeJS.ProcessEnv = process.env): Project[] {
  const chromiumLaunch = { args: [...CHROMIUM_GL_ARGS] };
  const iphoneOnChromium = env['E2E_IPHONE_ENGINE'] === 'chromium';
  const all: Project[] = [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: chromiumLaunch },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: { firefoxUserPrefs: { 'webgl.force-enabled': true } },
      },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'iphone',
      use: iphoneOnChromium
        ? { ...devices['iPhone 15'], browserName: 'chromium', launchOptions: chromiumLaunch }
        : { ...devices['iPhone 15'] },
    },
    {
      name: 'pixel',
      use: { ...devices['Pixel 7'], launchOptions: chromiumLaunch },
    },
  ];
  const wanted = (env['E2E_BROWSERS'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (wanted.length === 0) return all;
  return all.filter((p) => wanted.includes(String(p.name)));
}

export interface KitPlaywrightOptions {
  testDir: string;
  testMatch?: string | RegExp | Array<string | RegExp>;
  /** Default port (E2E_PORT overrides). */
  port: number;
  /** Command that serves the build; "{port}" is replaced. Null means an external server. */
  serverCommand: string | null;
  /** Path that answers when the server is up, e.g. "/games/". */
  readyPath: string;
  /** Host name in the base URL (default "localhost"; the static server binds 127.0.0.1). */
  host?: string;
}

export function kitPlaywrightConfig(
  o: KitPlaywrightOptions,
  env: NodeJS.ProcessEnv = process.env,
): PlaywrightTestConfig {
  const port = Number(env['E2E_PORT'] ?? o.port);
  const external = env['E2E_EXTERNAL_SERVER'] === '1';
  const host = o.host ?? 'localhost';
  const config: PlaywrightTestConfig = {
    testDir: o.testDir,
    fullyParallel: true,
    forbidOnly: true,
    retries: 0,
    workers: env['E2E_WORKERS'] ?? '50%',
    timeout: 90_000,
    expect: {
      timeout: 20_000,
      toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled', caret: 'hide' },
    },
    // Baselines are committed per project and platform.
    snapshotPathTemplate: '{testDir}/screenshots/{projectName}-{platform}/{arg}{ext}',
    reporter: [['list']],
    outputDir: 'test-results',
    use: {
      baseURL: `http://${host}:${port}`,
      serviceWorkers: 'allow',
      trace: 'retain-on-failure',
    },
    projects: kitProjects(env),
  };
  if (o.testMatch !== undefined) config.testMatch = o.testMatch;
  if (!external && o.serverCommand) {
    config.webServer = {
      command: o.serverCommand.replace('{port}', String(port)),
      url: `http://${host}:${port}${o.readyPath}`,
      reuseExistingServer: true,
      timeout: 120_000,
    };
  }
  return config;
}
