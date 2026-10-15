-- Fictional demo personas. Emails use the reserved .example TLD.
INSERT INTO "users" ("id", "name", "email", "role", "department") VALUES
  ('usr_maya_chen',   'Maya Chen',    'maya.chen@sustainops.example',    'sustainability_manager', NULL),
  ('usr_daniel_ortiz','Daniel Ortiz', 'daniel.ortiz@sustainops.example', 'reviewer',               NULL),
  ('usr_priya_nair',  'Priya Nair',   'priya.nair@sustainops.example',   'department_manager',     'Engineering'),
  ('usr_tom_becker',  'Tom Becker',   'tom.becker@sustainops.example',   'department_manager',     'Food & Beverage'),
  ('usr_lena_park',   'Lena Park',    'lena.park@sustainops.example',    'department_manager',     'Procurement')
ON CONFLICT ("id") DO NOTHING;
