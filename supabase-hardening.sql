-- ============================================================
-- 报价单审核系统 · 数据权限加固（2026-10-03）
-- 在 Supabase 后台 → SQL Editor 里执行
--
-- 起因：database.sql 给匿名用户开了「可上传 + 可查询」，
--       附件桶也是 public；实测 /api/records 不带密码就能拉走 100 条记录。
--
-- 前提（已核对代码）：所有数据库和存储访问都走 Next.js 接口，
-- 用的是 SUPABASE_SERVICE_ROLE_KEY（服务端密钥，不受 RLS 限制），
-- 客户端从未直连 Supabase。所以匿名用户**不需要**任何数据库权限，
-- 下面这些策略全部可以撤掉。
-- ============================================================

-- 1) 撤掉匿名策略（撤掉之后：匿名既读不到也写不进）
drop policy if exists "Allow anonymous insert" on quote_records;
drop policy if exists "Allow anonymous select" on quote_records;
drop policy if exists "Allow anonymous select price" on price_reference;
drop policy if exists "Allow anonymous upload" on storage.objects;
drop policy if exists "Allow anonymous read" on storage.objects;

-- 2) 确认两张表仍然是「开启 RLS + 无匿名策略」= 匿名一律读不到
alter table quote_records enable row level security;
alter table price_reference enable row level security;

-- 3) 附件桶改为私有
--    （代码里 fileUrl 一直是 undefined，实际上没往桶里传过文件，改动无风险）
update storage.buckets set public = false where id = 'quote-files';

-- 4) 执行完自查：
--    a) 用浏览器无痕窗口打开 https://你的域名/api/records  → 应返回 401
--    b) 正常上传一张报价单 → 仍应成功（走的是接口，不受影响）

-- 备注：本文件只是把「不必要开放的权限」关掉，不改任何表结构和数据。
