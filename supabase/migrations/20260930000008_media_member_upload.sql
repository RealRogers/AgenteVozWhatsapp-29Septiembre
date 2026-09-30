-- Outbound media: let workspace members upload into whatsapp-media from the
-- composer (browser → Storage direct), so file bytes never pass through a
-- Vercel function (~4.5MB body limit).
--
-- Path convention (same as inbound): {workspace_id}/{conversation_id}/{file}.
-- The INSERT policy mirrors workspace_member_read_media but ALSO requires a
-- sender-capable role — viewers may read media, never stage outbound files.

CREATE POLICY "workspace_member_write_media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'whatsapp-media'
  -- Guard the cast: a non-uuid first segment fails closed, not loudly.
  AND split_part(name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND auth_has_role(
    split_part(name, '/', 1)::uuid,
    ARRAY['admin', 'manager', 'agent']::workspace_role[]
  )
);

-- The bucket allowlist predates a few types MIME_EXTENSIONS already maps.
UPDATE storage.buckets
SET allowed_mime_types = (
  SELECT array_agg(DISTINCT m ORDER BY m)
  FROM unnest(
    allowed_mime_types || ARRAY[
      'image/jpg',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv'
    ]::text[]
  ) AS m
)
WHERE id = 'whatsapp-media';
