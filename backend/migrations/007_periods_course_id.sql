-- Migration 007: Add course_id to periods
ALTER TABLE periods ADD COLUMN course_id INT AFTER closed_at;
ALTER TABLE periods ADD INDEX ix_periods_course (course_id);
ALTER TABLE periods ADD FOREIGN KEY (course_id) REFERENCES courses(id);
