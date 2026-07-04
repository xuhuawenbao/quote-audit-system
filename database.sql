-- 报价单审核系统数据库表结构
-- 在 Supabase SQL Editor 中执行

-- 创建审核记录表
create table if not exists quote_records (
  id uuid default gen_random_uuid() primary key,
  submitter_name text not null,
  project_name text not null,
  file_name text not null,
  file_url text,
  file_type text not null check (file_type in ('excel', 'pdf', 'image')),
  audit_result jsonb not null default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 创建价格参考表
create table if not exists price_reference (
  id uuid default gen_random_uuid() primary key,
  category text not null,
  name text not null,
  spec text not null default '',
  brand text not null default '',
  unit text not null default '',
  price numeric not null,
  source text not null default '',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 创建索引
create index idx_quote_records_created_at on quote_records(created_at desc);
create index idx_quote_records_submitter on quote_records(submitter_name);
create index idx_quote_records_project on quote_records(project_name);
create index idx_price_reference_category on price_reference(category);
create index idx_price_reference_name on price_reference(name);

-- 启用 RLS（行级安全）
alter table quote_records enable row level security;
alter table price_reference enable row level security;

-- 允许匿名插入（项目人员上传）
create policy "Allow anonymous insert" on quote_records
  for insert to anon with check (true);

-- 允许匿名查询（结果页展示）
create policy "Allow anonymous select" on quote_records
  for select to anon using (true);

-- 价格参考表：允许匿名查询（审核时读取）
create policy "Allow anonymous select price" on price_reference
  for select to anon using (true);

-- 创建文件存储桶
insert into storage.buckets (id, name, public)
values ('quote-files', 'quote-files', true)
on conflict (id) do nothing;

-- 允许匿名上传文件
create policy "Allow anonymous upload" on storage.objects
  for insert to anon with check (bucket_id = 'quote-files');

-- 允许匿名读取文件
create policy "Allow anonymous read" on storage.objects
  for select to anon using (bucket_id = 'quote-files');
