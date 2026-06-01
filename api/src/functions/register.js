// Entry point: registers a CRUD endpoint pair for every resource in tables.js,
// then loads the specialized handlers that override or supplement them.
//
// IMPORTANT: `transactions` and `notifications` have dedicated GET handlers
// (transactions.js → ordered list; notificationsDerived.js → computed alerts).
// We must NOT also register a generic `GET /<resource>` for them, otherwise
// the Functions host fails to start with a route conflict on the same
// method+path. POST/PUT/PATCH/DELETE on those resources still go through CRUD.
const { registerCrud, TABLES } = require('../crud');

const SKIP_COLLECTION_GET = new Set(['transactions', 'notifications']);

for (const resource of Object.keys(TABLES)) {
  registerCrud(resource, { skipCollectionGet: SKIP_COLLECTION_GET.has(resource) });
}

// Specialized routes — register after generic CRUD so their explicit paths
// (`/transactions/check-out`, etc.) are unambiguous.
require('./transactions');
require('./sparesBulk');
require('./dashboard');
require('./notificationsDerived');
