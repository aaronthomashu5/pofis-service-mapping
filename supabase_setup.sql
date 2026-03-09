-- 1. Create Machine Catalog Table (if not exists)
create table if not exists public.machine_catalog (
  id uuid default uuid_generate_v4() primary key,
  make text not null,
  model text not null default '',
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique(make, model)
);

-- Enable RLS on machine_catalog
alter table public.machine_catalog enable row level security;

-- Allow public access to machine_catalog (or restrict as needed)
create policy "Public catalog access" on public.machine_catalog for all using (true);


-- 2. Create User Profiles Table for Role Management
create table if not exists public.user_profiles (
  id uuid references auth.users on delete cascade not null primary key,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS on user_profiles
alter table public.user_profiles enable row level security;

-- Policies for user_profiles
create policy "Public profiles are viewable by everyone."
  on public.user_profiles for select
  using ( true );

create policy "Users can insert their own profile."
  on public.user_profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile."
  on public.user_profiles for update
  using ( auth.uid() = id );

-- 3. Function to handle new user signup automatically
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, role)
  values (new.id, 'user');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to call the function on signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- 4. Update Policies for Machines and Maintenance Records to restrict DELETE to Admins

-- First, drop existing permissive policies if they exist (adjust names if different)
drop policy if exists "Public machines access" on public.machines;
drop policy if exists "Public records access" on public.maintenance_records;

-- Re-create policies for Machines
-- Allow SELECT, INSERT, UPDATE for everyone (Public)
create policy "Public machines select" on public.machines for select using (true);
create policy "Public machines insert" on public.machines for insert with check (true);
create policy "Public machines update" on public.machines for update using (true);

-- Allow DELETE only for Admins
create policy "Admins can delete machines"
  on public.machines for delete
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Re-create policies for Maintenance Records
-- Allow SELECT, INSERT, UPDATE for everyone (Public)
create policy "Public records select" on public.maintenance_records for select using (true);
create policy "Public records insert" on public.maintenance_records for insert with check (true);
create policy "Public records update" on public.maintenance_records for update using (true);

-- Allow DELETE only for Admins
create policy "Admins can delete records"
  on public.maintenance_records for delete
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );
