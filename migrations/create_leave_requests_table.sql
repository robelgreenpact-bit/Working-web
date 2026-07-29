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
