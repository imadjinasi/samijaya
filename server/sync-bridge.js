'use strict';
const { Worker, MessageChannel, receiveMessageOnPort } = require('node:worker_threads');
const path = require('node:path');

const worker = new Worker(path.join(__dirname, 'db-worker.js'));
const { port1, port2 } = new MessageChannel();
worker.postMessage({ op: 'attach', port: port2 }, [port2]);
let nextId = 1;
const pause = new Int32Array(new SharedArrayBuffer(4));
let workerDead = false;
worker.on('exit', () => { workerDead = true; });

function call(op, details = {}) {
  const id = nextId++;
  port1.postMessage({ id, op, ...details });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && !workerDead) {
    const packet = receiveMessageOnPort(port1);
    if (packet) {
      if (packet.message.id !== id) throw new Error('WORKER_SEQUENCE_ERROR');
      if (!packet.message.ok) throw new Error('WORKER_' + packet.message.code);
      return packet.message.result;
    }
    Atomics.wait(pause, 0, 0, 5);
  }
  throw new Error(workerDead ? 'WORKER_EXITED' : 'WORKER_TIMEOUT');
}

function query(sql, params) { return call('query', { sql, params }); }
function fetchSync(url, options) { return call('fetch', { url, options }); }
module.exports = { query, fetchSync };
