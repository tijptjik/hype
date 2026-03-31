-- Seed hub admin users
-- Adds admin role assignments for specified users to their respective hubs

INSERT INTO hubRole (hubId, userId, role)
VALUES
  ('4Jsk5LngvFZq', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', 'admin'),
  ('Zmr0egfhmvs-', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', 'admin')
ON CONFLICT(hubId, userId) DO UPDATE SET role = 'admin';
