-- 036: exactly one "local store" per ledger, with every other marked store
-- becoming that store's price-match list instead of a second kind of "mine".
--
-- The old model let several stores be is_local at once, each answering its
-- own "does this store price match" question. In practice you only ever
-- stand in one shop at a time, and what actually varies store to store is
-- whether THAT shop will honour a competitor's flyer -- and which competitor
-- matters too (Real Canadian Superstore won't match Walmart, but might
-- match No Frills). So: is_local now names the single shop you're in, and
-- the existing tri-state price_matches column on every OTHER row answers
-- "is this store in my local store's price-match list" instead.
--
-- No new column -- price_matches already existed on every row, just unasked
-- for non-local ones under the old model. Existing answers carry forward
-- unchanged; only is_local is touched.

-- Demote every is_local row but the most recently confirmed one per ledger,
-- so households with several stores marked under the old model don't lose
-- that data -- it becomes their starting price-match list instead.
with ranked as (
  select id, ledger_id,
    row_number() over (partition by ledger_id order by confirmed_at desc nulls last, created_at) as rn
  from store_policies where is_local
)
update store_policies sp set is_local = false
from ranked r where sp.id = r.id and r.rn > 1;

create unique index if not exists uq_store_policies_one_local on store_policies (ledger_id) where is_local;
