-- Demo catalog rows for local development (auth users come from seed-auth.mjs).

insert into public.titles (id, title, author, genre, isbn, description, replacement_cost)
values
  (
    'c0a10000-0000-4000-8000-000000000001',
    'Dune',
    'Frank Herbert',
    'Sci-fi',
    '9780441172719',
    'A desert planet, a precious spice, and a dynasty in crisis.',
    24.00
  ),
  (
    'c0a10000-0000-4000-8000-000000000002',
    'Pride and Prejudice',
    'Jane Austen',
    'Fiction',
    '9780141439518',
    'Manners, marriage, and mistaken first impressions.',
    18.00
  ),
  (
    'c0a10000-0000-4000-8000-000000000003',
    'The Left Hand of Darkness',
    'Ursula K. Le Guin',
    'Sci-fi',
    '9780441478125',
    'An envoy on a winter world of shifting gender.',
    22.00
  );

insert into public.copies (title_id, barcode, status)
values
  ('c0a10000-0000-4000-8000-000000000001', 'BK-DUNE-001', 'available'),
  ('c0a10000-0000-4000-8000-000000000001', 'BK-DUNE-002', 'on_loan'),
  ('c0a10000-0000-4000-8000-000000000001', 'BK-DUNE-003', 'available'),
  ('c0a10000-0000-4000-8000-000000000002', 'BK-AUSTEN-001', 'available'),
  ('c0a10000-0000-4000-8000-000000000002', 'BK-AUSTEN-002', 'damaged'),
  ('c0a10000-0000-4000-8000-000000000003', 'BK-LEGUIN-001', 'available'),
  ('c0a10000-0000-4000-8000-000000000003', 'BK-LEGUIN-002', 'available');
