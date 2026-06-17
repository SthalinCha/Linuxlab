-- Migration: Period system (Phase 4 — Assignments module)
-- Adds code/is_active/closed_at to periods, backfills legacy data
-- Run: sqlite3 linuxlab.db < migrations/002_periods_migration.sql

-- 1. Backfill existing periods with computed LEGACY codes
UPDATE periods SET
  code = 'LEGACY-' || COALESCE(name, 'P' || id),
  is_active = 0
WHERE code IS NULL OR code = '';

-- 2. Set most recent period (by start_date) as active
UPDATE periods SET is_active = 1
WHERE id = (SELECT id FROM periods WHERE is_active = 0 ORDER BY start_date DESC LIMIT 1);

-- 3. Backfill vm_name_snapshot from the VM name for existing assignments
UPDATE vm_assignments SET
  vm_name_snapshot = (SELECT name FROM virtual_machines WHERE virtual_machines.id = vm_assignments.vm_id)
WHERE vm_name_snapshot IS NULL AND vm_id IS NOT NULL;
