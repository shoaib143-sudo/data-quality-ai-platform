import fs from 'node:fs'
import path from 'node:path'

const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')
if (!fs.existsSync(targetDir)) throw new Error(`TARGET_MIGRATION_DIR does not exist: ${targetDir}`)

const version = '20260904052950'
const replay = `${version}_reconstruct_validation_fixtures.sql`
const targetPath = path.join(targetDir, replay)

const collision = fs.readdirSync(targetDir).some((name) => name.startsWith(`${version}_`))
if (collision) throw new Error(`Validation fixture replay version collides with existing migration ${version}`)

const sql = `
create schema if not exists jdbc_test;
create table if not exists jdbc_test.customers (
  customer_id bigint primary key,
  full_name text not null,
  email text,
  country text,
  age integer,
  is_active boolean not null default true,
  signup_date date,
  created_at timestamptz not null default now()
);
alter table jdbc_test.customers enable row level security;

create schema if not exists profiling_validation;
create table if not exists profiling_validation.synthetic_customers (
  customer_id integer,
  name text,
  email text,
  phone_number text,
  country text,
  signup_date text,
  age integer,
  national_id text
);
alter table profiling_validation.synthetic_customers enable row level security;
`

fs.writeFileSync(targetPath, sql.trimStart())
console.log(`RECONSTRUCTED ${replay}: released history creates explicit-deny policies on jdbc_test.customers and profiling_validation.synthetic_customers before those validation fixtures are represented; replay restores their exact live shapes.`)
