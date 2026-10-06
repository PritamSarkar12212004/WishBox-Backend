/**
 * MongoDB connectivity check: `npm run db:check`
 *
 * Answers "why won't the app connect?" without leaking credentials, by testing
 * the layers in order - DNS (SRV/TXT) -> TCP -> TLS/MongoDB handshake - and
 * classifying the failure. A failed Atlas connection usually surfaces as the
 * generic "could not connect to any servers" message, which points developers
 * at the IP allowlist even when the real cause is something else.
 *
 * Exit code 0 = connected, 1 = failed.
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { httpClient } from '../src/shared/httpClient.js';
import { createChildLogger } from '../src/config/logger.js';

const log = createChildLogger('db:check');

const TIMEOUT_MS = 8_000;

/** Credentials never reach the terminal. */
function safeUri(uri: string): string {
  return uri.replace(/\/\/([^@/]*?)@/, (_match, userinfo: string) => {
    const user = userinfo.split(':')[0];
    return `//${user ? `${user}:***` : '***'}@`;
  });
}

function shape(uri: string) {
  const afterScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const at = afterScheme.lastIndexOf('@');
  const hostAndRest = at === -1 ? afterScheme : afterScheme.slice(at + 1);
  const [host, query = ''] = hostAndRest.split('?');
  const [hostname, database = ''] = host.split('/');
  return { isSrv: uri.startsWith('mongodb+srv://'), hostname, database, query };
}

function tcpProbe(host: string, port: number): Promise<string> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (result: string) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(TIMEOUT_MS);
    socket.on('connect', () => finish('TCP OK'));
    socket.on('timeout', () => finish(`TCP TIMEOUT after ${TIMEOUT_MS}ms`));
    socket.on('error', (error: NodeJS.ErrnoException) => finish(`TCP ${error.code ?? 'ERROR'}`));
  });
}

async function publicAddress(family: 'v4' | 'v6'): Promise<string> {
  const url = family === 'v4' ? 'https://api.ipify.org?format=json' : 'https://api6.ipify.org?format=json';
  try {
    const response = await httpClient.get<{ ip: string }>(url, { timeout: TIMEOUT_MS, family: family === 'v4' ? 4 : 6 });
    return response.data.ip;
  } catch (error) {
    return `unavailable (${error instanceof Error ? error.message : String(error)})`;
  }
}

/** Every distinct per-server error the driver saw, which is where the real cause lives. */
function serverErrors(error: unknown): string[] {
  const servers = (error as { reason?: { servers?: Map<string, { error?: Error }> } })?.reason?.servers;
  if (!(servers instanceof Map)) return [];
  return [...servers.entries()].map(([host, description]) => `${host}: ${description?.error?.message ?? 'no detail'}`);
}

function classify(messages: string[]): { verdict: string; hints: string[] } {
  const combined = messages.join(' ');
  if (/alert number 80|internal error/i.test(combined)) {
    return {
      verdict: 'TLS handshake refused by the server before any MongoDB handshake',
      hints: [
        'Almost always the Atlas Network Access list: this machine\'s source IP is not allowed.',
        'Add it at https://cloud.mongodb.com -> your project -> Security -> Network Access (0.0.0.0/0 + ::/0 for local dev).',
        'Atlas blocks at the TLS layer, so TCP may still succeed while this fails.',
        'If the IP is already allowed, check that the cluster is not paused.',
      ],
    };
  }
  if (/authentication failed|bad auth|SCRAM/i.test(combined)) {
    return {
      verdict: 'Credentials rejected by the server',
      hints: ['Check MONGODB_USERNAME / MONGODB_PASSWORD, and that the user exists on THIS cluster.'],
    };
  }
  if (/ENOTFOUND|ESERVFAIL|querySrv/i.test(combined)) {
    return { verdict: 'DNS failed', hints: ['Check the cluster hostname and your DNS/network configuration.'] };
  }
  if (/ETIMEDOUT|ECONNREFUSED|TIMEOUT/i.test(combined)) {
    return { verdict: 'Network unreachable', hints: ['Check the host:port, VPN, firewall and the Atlas allowlist.'] };
  }
  return { verdict: 'Unclassified failure', hints: messages.slice(0, 3) };
}

const { MONGODB_URI } = env;
const info = shape(MONGODB_URI);

console.log(`URI         : ${safeUri(MONGODB_URI)}`);
console.log(`host        : ${info.hostname}`);
console.log(`database    : ${info.database || '(none - the driver would fall back to "test")'}`);
console.log(`public IPv4 : ${await publicAddress('v4')}`);
console.log(`public IPv6 : ${await publicAddress('v6')}`);

const candidates: Array<{ host: string; port: number }> = [];

if (info.isSrv) {
  try {
    const records = await dns.resolveSrv(`_mongodb._tcp.${info.hostname}`);
    console.log(`\nSRV records : ${records.length}`);
    for (const record of records) {
      candidates.push({ host: record.name, port: record.port });
      console.log(`  ${record.name}:${record.port} -> ${await tcpProbe(record.name, record.port)}`);
    }
  } catch (error) {
    console.log(`\nSRV lookup FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  try {
    const txt = await dns.resolveTxt(info.hostname);
    console.log(`TXT options : ${txt.map((entry) => entry.join('')).join(' | ')}`);
  } catch {
    console.log('TXT options : (none)');
  }
} else {
  const [host, portText] = info.hostname.split(':');
  candidates.push({ host, port: Number(portText ?? 27017) });
  console.log(`\nTCP         : ${await tcpProbe(host, Number(portText ?? 27017))}`);
}

console.log('\nHandshake   : connecting...');
const started = Date.now();
try {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: TIMEOUT_MS });
  const db = mongoose.connection.db!;
  await db.admin().ping();
  const { version } = await db.admin().serverInfo();
  const collections = await db.listCollections().toArray();
  console.log(`Handshake   : OK in ${Date.now() - started}ms`);
  console.log(`server      : MongoDB ${version} | host ${mongoose.connection.host}`);
  console.log(`database    : ${db.databaseName} (${collections.length} collection(s): ${collections.map((c) => c.name).join(', ') || 'empty'})`);
  log.info('MongoDB connectivity check passed');
  console.log('\nVERDICT     : connection healthy');
  await mongoose.disconnect();
  process.exit(0);
} catch (error) {
  const details = serverErrors(error);
  console.log(`Handshake   : FAILED after ${Date.now() - started}ms`);
  console.log(`error       : ${(error as Error).message}`);
  if (details.length > 0) {
    console.log('\nper-server errors:');
    for (const detail of details) console.log(`  ${detail}`);
  }
  const { verdict, hints } = classify([(error as Error).message, ...details]);
  console.log(`\nVERDICT     : ${verdict}`);
  for (const hint of hints) console.log(`  • ${hint}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
}
