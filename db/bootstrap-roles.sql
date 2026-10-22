-- Creates DemandAI's three database roles and hands the database to the owner role.
-- Run once per PostgreSQL cluster as an administrator (the Compose db service runs it on first start through
-- db/init/10-roles.sh; on a managed service such as Amazon RDS, the master user runs it with psql):
--
--   psql "host=... user=<admin> dbname=postgres sslmode=require" \
--     -v owner_pw=... -v app_pw=... -v ops_pw=... -v dbname=demandai -f db/bootstrap-roles.sql
--
-- demandai_owner  owns the schema; runs migrations (DDL) and the SECURITY DEFINER functions they create.
-- demandai_app    the application at runtime: data access only, subject to row-level security.
-- demandai_ops    operations: purge and export functions only.
-- Existing roles are left as they are (rotate passwords with ALTER ROLE, see docs/devops).
\set ON_ERROR_STOP on

SELECT format('CREATE ROLE demandai_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L', :'owner_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'demandai_owner') \gexec
SELECT format('CREATE ROLE demandai_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L', :'app_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'demandai_app') \gexec
SELECT format('CREATE ROLE demandai_ops LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L', :'ops_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'demandai_ops') \gexec

SELECT format('CREATE DATABASE %I OWNER demandai_owner', :'dbname')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'dbname') \gexec

-- On a managed service the admin must be able to act as the new owner before handing the database over.
SELECT format('GRANT demandai_owner TO %I', current_user)
WHERE NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) \gexec

ALTER DATABASE :"dbname" OWNER TO demandai_owner;
REVOKE ALL ON DATABASE :"dbname" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"dbname" TO demandai_app, demandai_ops;

\connect :"dbname"
ALTER SCHEMA public OWNER TO demandai_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO demandai_app, demandai_ops;
