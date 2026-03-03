# Settings (`/settings`)

**Component:** `client/src/views/SettingsView.jsx`
**Nav group:** *(bottom utility group)*

## Purpose
User account settings and application preferences.

## Features
- Change password
- Display preferences (reserved for future use)
- Account information (email, role, joined date)
- Admin panel: user management (visible to `role='admin'` only)

## Data Sources
- `POST /api/auth/change-password` — password update
- `GET /api/auth/me` — current user info
- `GET /api/admin/users` — user list (admin only)

## Changelog

| Date | Change |
|------|--------|
| 2026-03-02 | Initial build with auth system |
