import { spawn } from 'node:child_process';

const port = Number(process.env.PORT ?? 3210);
const baseUrl = `http://127.0.0.1:${port}`;
const timeoutMs = 90000;
const startTime = Date.now();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchHome = async () => {
  const res = await fetch(baseUrl, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Expected 200 from ${baseUrl}, got ${res.status}`);
  }
  return res.text();
};

const startServer = () =>
  spawn('npm', ['run', 'start', '--', '--port', String(port)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

const server = startServer();
let logs = '';

server.stdout.on('data', (chunk) => {
  logs += chunk.toString();
});
server.stderr.on('data', (chunk) => {
  logs += chunk.toString();
});

try {
  while (Date.now() - startTime < timeoutMs) {
    if (server.exitCode != null) {
      throw new Error(`next start exited early (${server.exitCode})`);
    }
    try {
      const html = await fetchHome();
      if (!html.includes('High Volume')) {
        throw new Error('Expected "High Volume" label in production-rendered HTML.');
      }
      if (!html.includes('/?view=high-volume')) {
        throw new Error('Expected "/?view=high-volume" link in production-rendered HTML.');
      }
      console.log('high-volume-prod-smoke: passed');
      process.exit(0);
    } catch {
      await wait(1000);
    }
  }
  throw new Error('Timed out waiting for production server readiness.');
} catch (error) {
  console.error('high-volume-prod-smoke: failed');
  console.error(String(error));
  console.error(logs.slice(-4000));
  process.exitCode = 1;
} finally {
  if (server.exitCode == null) {
    server.kill('SIGTERM');
  }
}
