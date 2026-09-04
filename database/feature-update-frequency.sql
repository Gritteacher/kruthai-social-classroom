begin;
alter table public.feature_updates add column if not exists display_frequency text not null
  default 'once' check(display_frequency in ('once','every_visit'));
notify pgrst,'reload schema';
commit;
