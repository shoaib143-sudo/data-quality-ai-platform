revoke all privileges on all tables in schema app from anon;
revoke all privileges on all tables in schema catalog from anon;
revoke all privileges on all tables in schema profiling from anon;
revoke all privileges on all tables in schema governance from anon;
revoke all privileges on all tables in schema orchestration from anon;

revoke all privileges on all sequences in schema app from anon;
revoke all privileges on all sequences in schema catalog from anon;
revoke all privileges on all sequences in schema profiling from anon;
revoke all privileges on all sequences in schema governance from anon;
revoke all privileges on all sequences in schema orchestration from anon;

alter default privileges in schema app revoke all on tables from anon;
alter default privileges in schema catalog revoke all on tables from anon;
alter default privileges in schema profiling revoke all on tables from anon;
alter default privileges in schema governance revoke all on tables from anon;
alter default privileges in schema orchestration revoke all on tables from anon;

alter default privileges in schema app revoke all on sequences from anon;
alter default privileges in schema catalog revoke all on sequences from anon;
alter default privileges in schema profiling revoke all on sequences from anon;
alter default privileges in schema governance revoke all on sequences from anon;
alter default privileges in schema orchestration revoke all on sequences from anon;
