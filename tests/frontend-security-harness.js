const fs = require('fs');
const assert = require('assert');

const app = fs.readFileSync('docs/app.js', 'utf8');
const html = fs.readFileSync('docs/index.html', 'utf8');

const saveSessionBody = /function saveSession\(\) \{([\s\S]*?)\n\}/.exec(app)[1];
assert(saveSessionBody.includes("JSON.stringify({ token: String(session.token) })"));
assert(!saveSessionBody.includes('JSON.stringify(session)'));
assert(app.includes("parsed.protocol === 'https:'"));
assert(app.includes("window.open(url, '_blank', 'noopener,noreferrer')"));
assert(!app.includes("window.open(\\'"), 'catalog data must not be interpolated into window.open handlers');
assert(!app.includes("onclick=\"window.open(\\'"), 'image URL must not be embedded in inline JavaScript');
assert(html.includes('Content-Security-Policy'));
assert(html.includes("object-src 'none'"));
assert(html.includes("base-uri 'self'"));
assert(!html.includes('frame-ancestors'), 'frame-ancestors is ineffective in meta CSP');
console.log('frontend-security-harness: all assertions passed');
