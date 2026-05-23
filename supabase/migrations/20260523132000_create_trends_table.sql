-- NO-OP: Original migration targeted a pre-existing `trends` table
-- with incompatible schema in production.
-- Replaced to keep migration history intact and unblock forward migrations.
-- Canonical table is created in:
-- 20260523133500_create_social_trends_table.sql
do $$
begin
  null;
end
$$;
