-- Migration: Unique partial indexes to prevent race conditions (Phase 0)
-- Prevents: same VM assigned to two students, same student with two VMs
-- Run: sqlite3 linuxlab.db < migrations/003_unique_active_assignment.sql

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_vm_period
ON vm_assignments (vm_id, period_id)
WHERE released_at IS NULL AND vm_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_student_period
ON vm_assignments (student_id, period_id)
WHERE released_at IS NULL;
