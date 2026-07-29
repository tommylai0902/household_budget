-- 027: drop grocery_list.size, added one migration ago in 026.
--
-- Size on its own turned out to be a bad filter rather than a weak one: it is
-- matched as a substring of the flyer item's name, so "750" against a search
-- for milk returns "MILK BONE DOG BISCUITS ... 750-900 G". Brand does the real
-- narrowing ("grace" + milk lands on GRACE COCONUT MILK across six stores),
-- and a field that mostly makes results worse is worth removing rather than
-- explaining.

alter table grocery_list drop column if exists size;
