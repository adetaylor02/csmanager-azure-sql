/**
 * Table metadata for generic CRUD endpoints.
 * key = REST resource segment, value = { table, pk, columns (writable DB names) }.
 * Field renames between camelCase UI and snake_case DB live in api/src/mapping.js.
 */
module.exports = {
  spares: {
    table: 'dbo.spares', pk: 'id',
    columns: ['id','part_name','description','manufacturer','model_number','serial_number',
      'equipment_supported','documents','category','criticality','condition','min_stock',
      'quantity','unit_cost','lead_time_days','expiry_date','site','location_id','bin',
      'supplier_id','last_used','last_inspected','batch_id','notes'],
  },
  inventory: {
    table: 'dbo.inventory', pk: 'id',
    columns: ['id','spare_id','site','location_id','bin','quantity'],
  },
  equipment: {
    table: 'dbo.equipment', pk: 'id',
    columns: ['id','tag','name','manufacturer','model','system_type','category','criticality',
      'site','location_id','install_date'],
  },
  suppliers: {
    table: 'dbo.suppliers', pk: 'id',
    columns: ['id','name','contact','email','phone','lead_time_days'],
  },
  transactions: {
    table: 'dbo.transactions', pk: 'id',
    columns: ['id','type','spare_id','quantity','technician','work_order','asset_id',
      'from_location','to_location','condition','reason','site','ts'],
  },
  users: {
    table: 'dbo.users', pk: 'id',
    columns: ['id','email','display_name','active'],
  },
  roles: {
    table: 'dbo.roles', pk: 'id',
    columns: ['id','description'],
  },
  sites: {
    table: 'dbo.sites', pk: 'id',
    columns: ['id','name','region','active'],
  },
  locations: {
    table: 'dbo.locations', pk: 'id',
    columns: ['id','site','name','building','room'],
  },
  inspections: {
    table: 'dbo.inspections', pk: 'id',
    columns: ['id','spare_id','inspector','status','inspection_date','next_due',
      'condition','findings','site','notes'],
  },
  reorders: {
    table: 'dbo.reorders', pk: 'id',
    columns: ['id','spare_id','quantity','reason','supplier','estimated_cost','required_by',
      'requested_by','status','site','created_at'],
  },
  'purchase-orders': {
    table: 'dbo.purchase_orders', pk: 'id',
    columns: ['id','spare_id','quantity','supplier_id','status','requested_by','approved_by',
      'eta','site','notes'],
  },
  'work-orders': {
    table: 'dbo.work_orders', pk: 'id',
    columns: ['id','title','asset_id','status','priority','assignee','site','description',
      'due_date','closed_at'],
  },
  'audit-logs': {
    table: 'dbo.audit_logs', pk: 'id',
    columns: ['id','ts','user','site','action','entity','entity_id','details','old_value',
      'new_value','notes'],
  },
  notifications: {
    table: 'dbo.notifications', pk: 'id',
    columns: ['id','type','severity','message','entity_id','site','acknowledged','ack_by','ack_at'],
  },
  reports: {
    table: 'dbo.reports', pk: 'id',
    columns: ['id','name','kind','params','created_by'],
  },
  settings: {
    table: 'dbo.settings', pk: 'key',
    columns: ['key','value'],
  },
};
