
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 5242880, array['image/png','image/jpeg','image/jpg','image/webp','image/gif','image/bmp','image/svg+xml'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;

create policy "Public can view images"
on storage.objects for select
using (bucket_id = 'images');

create policy "Authenticated can upload images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'images');

create policy "Authenticated can update images"
on storage.objects for update
to authenticated
using (bucket_id = 'images');

create policy "Authenticated can delete images"
on storage.objects for delete
to authenticated
using (bucket_id = 'images');
