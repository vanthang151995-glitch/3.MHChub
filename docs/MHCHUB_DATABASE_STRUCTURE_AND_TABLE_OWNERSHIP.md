# MHChub Database Structure And Table Ownership

This document records ownership boundaries for tables in the `mhchub` MySQL database. It is intended to prevent Safety - 6S changes from touching IoT operations data by accident.

## Migration Ownership

| Migration | Owner | Purpose |
| --- | --- | --- |
| `001_auth_schema.sql` | Auth | Login users, roles, and cookie-session backing data. |
| `002_documents_schema.sql` | Documents | Document metadata and uploaded file references. |
| `003_app_settings_schema.sql` | App Settings | MHChub runtime configuration stored in MySQL. |
| `004_safety_bulletins_schema.sql` | Safety Bulletins | Existing lightweight Safety bulletin/reference content. |
| `005_safety_operations_schema.sql` | Safety Operations | New Safety - 6S operational workflows. |

## Safety Operations Tables

| Table | Owner | Notes |
| --- | --- | --- |
| `safety_warnings` | Safety Operations | Risk warnings, approval status, owner department, soft delete. |
| `safety_incidents` | Safety Operations | Incident reports, root-cause fields, approval status, soft delete. |
| `safety_kpi_entries` | Safety Operations | Period KPI submissions with L1/L2 approval workflow. |
| `safety_checklist_submissions` | Safety Operations | Department and period checklist item state. |
| `safety_approval_actions` | Safety Operations | Immutable approval/rejection audit feed for Safety entities. |
| `safety_notifications` | Safety Operations | Role and department scoped Safety notifications. |
| `safety_reports` | Safety Operations | Safety report metadata and lifecycle status. |
| `safety_training_courses` | Safety Operations | Training course metadata and completion counters. |
| `safety_attachments` | Safety Operations | Attachment references for Safety entities. File storage is not implemented for v1. |
| `user_profiles` | Auth + Safety Operations | Optional profile fields used by Safety screens; keyed by existing auth user id. |

## Access Boundary

Safety Operations API endpoints must use `auth.requireSession`. Department scoped users (`viewer`, `leader`) should only read or write their own department records unless a route explicitly supports review. `ehs` and `admin` can review all Safety Operations records.

Existing IoT operations tables and runtime data are outside the Safety Operations owner boundary. Do not add cross-domain writes from `mysqlSafetyOperationsStore` into IoT operations storage.

## Indexing Standard

Safety Operations migrations must keep indexes for hot list/filter paths:

- `department` or `department_code`
- `approval_status`
- `status`
- `period`
- date fields used for sorting or aging, such as `updated_at`, `created_at`, `deadline`, `occurred_date`, and `due_date`
