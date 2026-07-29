create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public_users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  days_count integer not null check (days_count > 0),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  manager_comment text,
  created_at timestamptz not null default now()
);

create index if not exists leave_requests_requester_id_idx on leave_requests(requester_id);
create index if not exists leave_requests_status_idx on leave_requests(status);

alter table leave_requests enable row level security;

create policy if not exists leave_requests_self_insert
  on leave_requests
  for insert
  to authenticated
  with check (requester_id = auth.uid());

create policy if not exists leave_requests_self_select
  on leave_requests
  for select
  to authenticated
  using (requester_id = auth.uid());

create policy if not exists leave_requests_self_update
  on leave_requests
  for update
  to authenticated
  using (requester_id = auth.uid())
  with check (requester_id = auth.uid());

create policy if not exists leave_requests_manager_select
  on leave_requests
  for select
  to authenticated
  using (
    exists (
      select 1
      from public_users pu
      where pu.id = auth.uid() and pu.role = 'manager'
    )
  );

create policy if not exists leave_requests_manager_update
  on leave_requests
  for update
  to authenticated
  using (
    exists (
      select 1
      from public_users pu
      where pu.id = auth.uid() and pu.role = 'manager'
    )
  )
  with check (
    exists (
      select 1
      from public_users pu
      where pu.id = auth.uid() and pu.role = 'manager'
    )
  );
