'use strict';
const { parentPort } = require('node:worker_threads');
const { Client } = require('pg');

let client;
let port;
let queue = Promise.resolve();

async function connect() {
  if (client) return;
  const next = new Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'samijaya',
    user: process.env.PGUSER || 'samijaya_app',
    password: process.env.PGPASSWORD,
    connectionTimeoutMillis: 5000,
    statement_timeout: 20000,
    application_name: 'samijaya-mi8'
  });
  await next.connect();
  client = next;
}

async function execute(message) {
  if (message.op === 'query') {
    await connect();
    const result = await client.query(message.sql, message.params || []);
    return { rows: result.rows, rowCount: result.rowCount };
  }
  if (message.op === 'fetch') {
    const options = message.options || {};
    const response = await fetch(message.url, {
      method: String(options.method || 'GET').toUpperCase(),
      headers: { ...(options.headers || {}), ...(options.contentType ? {'Content-Type':options.contentType} : {}) },
      body: options.payload,
      signal: AbortSignal.timeout(12000),
      redirect: 'error'
    });
    return { status: response.status, body: await response.text() };
  }
  throw new Error('UNKNOWN_WORKER_OPERATION');
}

parentPort.on('message', message => {
  if (message.op !== 'attach') return;
  port = message.port;
  port.on('message', incoming => {
    queue = queue.then(async () => {
      try {
        port.postMessage({ id: incoming.id, ok: true, result: await execute(incoming) });
      } catch (error) {
        port.postMessage({ id: incoming.id, ok: false, code: String(error.code || error.name || 'ERROR').slice(0, 40) });
      }
    });
  });
});
