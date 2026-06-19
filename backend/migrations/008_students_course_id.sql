-- Migration 008: Add course_id to students
ALTER TABLE students ADD COLUMN course_id INT AFTER created_by;
ALTER TABLE students ADD INDEX ix_students_course (course_id);
ALTER TABLE students ADD FOREIGN KEY (course_id) REFERENCES courses(id);
