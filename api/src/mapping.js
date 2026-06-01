/**
 * Field name + JSON-column mapping between the camelCase UI shape and the
 * snake_case SQL columns. Used by the generic CRUD layer so the REST API
 * accepts/returns the same object shape the React app already uses.
 */

// db column name -> UI property name. Anything not listed is passed through.
const MAPS = {
  spares: {
    part_name: 'partName', model_number: 'modelNumber', serial_number: 'serialNumber',
    min_stock: 'minStock', unit_cost: 'unitCost', lead_time_days: 'leadTimeDays',
    expiry_date: 'expiryDate', location_id: 'location', supplier_id: 'supplier',
    last_used: 'lastUsed', last_inspected: 'lastInspected',
    equipment_supported: 'equipmentSupported', // JSON
    documents: 'documents',                    // JSON
    created_at: 'createdAt', batch_id: 'batchId',
  },
  equipment: {
    system_type: 'systemType', location_id: 'location',
  },
  transactions: {
    spare_id: 'spareId', work_order: 'workOrder', asset_id: 'assetId',
    from_location: 'fromLocation', to_location: 'toLocation', ts: 'timestamp',
  },
  suppliers: { lead_time_days: 'leadTimeDays' },
  inspections: {
    spare_id: 'spareId', inspection_date: 'inspectionDate',
    next_due: 'nextDue',
  },
  reorders: {
    spare_id: 'spareId', estimated_cost: 'estimatedCost', required_by: 'requiredBy',
    requested_by: 'requestedBy', created_at: 'createdAt',
  },
  'purchase-orders': {
    spare_id: 'spareId', supplier_id: 'supplier', requested_by: 'requestedBy',
    approved_by: 'approvedBy', created_at: 'createdAt',
  },
  'work-orders': {
    asset_id: 'assetId', due_date: 'dueDate', closed_at: 'closedAt', created_at: 'createdAt',
  },
  'audit-logs': {
    entity_id: 'entityId', ts: 'timestamp',
  },
  notifications: {
    entity_id: 'entityId', ack_by: 'ackBy', ack_at: 'ackAt', created_at: 'timestamp',
  },
  locations: { /* identity */ },
  sites: { /* identity */ },
  roles: { /* identity */ },
  users: { display_name: 'displayName', created_at: 'createdAt' },
  settings: { /* identity */ },
  reports: { created_by: 'createdBy', created_at: 'createdAt' },
  inventory: { spare_id: 'spareId', location_id: 'location' },
};

// JSON columns: stringify on write, parse on read.
const JSON_COLS = {
  spares: ['equipment_supported', 'documents'],
  reports: ['params'],
};

function inverse(map) {
  const out = {};
  for (const [db, ui] of Object.entries(map)) out[ui] = db;
  return out;
}

function fromDb(resource, row) {
  if (!row) return row;
  const map = MAPS[resource] || {};
  const jsonCols = JSON_COLS[resource] || [];
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const key = map[k] || k;
    if (jsonCols.includes(k) && typeof v === 'string') {
      try { out[key] = JSON.parse(v); } catch { out[key] = v; }
    } else {
      out[key] = v;
    }
  }
  return out;
}

function toDb(resource, payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const inv = inverse(MAPS[resource] || {});
  const jsonCols = JSON_COLS[resource] || [];
  const out = {};
  for (const [k, v] of Object.entries(payload)) {
    const key = inv[k] || k;
    if (jsonCols.includes(key) && v !== null && typeof v !== 'string') {
      out[key] = JSON.stringify(v);
    } else {
      out[key] = v;
    }
  }
  return out;
}

module.exports = { fromDb, toDb, MAPS, JSON_COLS };
