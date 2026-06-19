ALTER TABLE virtual_machines ADD COLUMN owner_id INT NULL,
  ADD INDEX ix_vm_owner (owner_id),
  ADD FOREIGN KEY (owner_id) REFERENCES users(id);

ALTER TABLE students ADD COLUMN created_by INT NULL,
  ADD INDEX ix_student_creator (created_by),
  ADD FOREIGN KEY (created_by) REFERENCES users(id);
