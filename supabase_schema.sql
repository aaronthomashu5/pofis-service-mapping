
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Machines Table
create table machines (
  id uuid default uuid_generate_v4() primary key,
  serial_number text,
  part_number text,
  make text,
  model text,
  client text,
  client_email text,
  client_asset_number text,
  contact_person text,
  contact_number text,
  photo text, -- Base64 or URL
  warranty_status text,
  invoice_photo text,
  site_photos jsonb, -- Array of strings
  customer_signature text,
  batch_id text,
  service_status text,
  last_status_update bigint,
  priority_index int,
  inspection_report jsonb,
  material_request jsonb,
  service_logs jsonb, -- Array of log objects
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Maintenance Records Table
create table maintenance_records (
  id uuid default uuid_generate_v4() primary key,
  machine_id uuid references machines(id) on delete cascade,
  date text,
  technician text,
  description text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- RLS Policies (Optional - adjust as needed)
alter table machines enable row level security;
alter table maintenance_records enable row level security;

create policy "Public machines access" on machines for all using (true);
create policy "Public records access" on maintenance_records for all using (true);

-- Machine Catalog Table (for autocomplete)
create table machine_catalog (
  id uuid default uuid_generate_v4() primary key,
  make text not null,
  model text not null default '',
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique(make, model)
);

alter table machine_catalog enable row level security;
create policy "Public catalog access" on machine_catalog for all using (true);

-- Parts Catalog Table
create table parts_catalog (
  id uuid default uuid_generate_v4() primary key,
  part_number text not null,
  part_name text not null,
  make text,
  compatible_machines jsonb default '[]'::jsonb, -- Array of machine model strings
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique(part_number)
);

alter table parts_catalog enable row level security;
create policy "Public parts access" on parts_catalog for all using (true);

-- Clients Catalog Table
create table clients_catalog (
  id uuid default uuid_generate_v4() primary key,
  name text not null unique,
  email text,
  contact_person text,
  contact_number text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

alter table clients_catalog enable row level security;
create policy "Public clients access" on clients_catalog for all using (true);

-- Makes Catalog Table
create table makes_catalog (
  id uuid default uuid_generate_v4() primary key,
  name text not null unique,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

alter table makes_catalog enable row level security;
create policy "Public makes access" on makes_catalog for all using (true);

-- Models Catalog Table
create table if not exists models_catalog (
  id uuid default uuid_generate_v4() primary key,
  name text not null unique,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

alter table models_catalog enable row level security;
create policy "Public models access" on models_catalog for all using (true);
