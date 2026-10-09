-- Local development credentials only. Never use this file for a deployed database.
CREATE ROLE together_runtime LOGIN PASSWORD 'localruntime';
CREATE DATABASE together_test;
GRANT CONNECT ON DATABASE together_dev TO together_runtime;
\connect together_dev
GRANT USAGE ON SCHEMA public TO together_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO together_runtime;
