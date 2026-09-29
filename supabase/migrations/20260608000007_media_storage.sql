-- Migration: whatsapp-media storage bucket + RLS policies
-- F8-D1: Multimedia support for inbound media messages
--
-- NOTE: The INSERT into storage.buckets may fail if the service role lacks
-- direct storage schema write access. In that case, create the bucket via
-- the Supabase dashboard (Storage → New bucket) with these settings:
--   Name: whatsapp-media
--   Public: false
--   File size limit: 50 MB
--   Allowed MIME types: (see list below)
-- Then re-run this migration so the RLS policies are applied.

-- Create the private bucket for WhatsApp media files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  false,
  52428800, -- 50 MB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp4',
    'audio/aac',
    'audio/wav',
    'video/mp4',
    'video/3gpp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS: service role can upload (used by media-handler.ts running server-side)
CREATE POLICY "service_role_upload_media"
ON storage.objects
FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'whatsapp-media');

-- RLS: service role can read (used to generate signed URLs)
CREATE POLICY "service_role_read_media"
ON storage.objects
FOR SELECT
TO service_role
USING (bucket_id = 'whatsapp-media');

-- RLS: service role can delete (for future cleanup jobs)
CREATE POLICY "service_role_delete_media"
ON storage.objects
FOR DELETE
TO service_role
USING (bucket_id = 'whatsapp-media');

-- Authenticated users can read objects that belong to their workspace.
-- Path convention: {workspace_id}/{conversation_id}/{filename}
-- The workspace_id is the first path segment, which we match via the auth.uid()
-- lookup against workspace_members (adjust table/column names if they differ).
CREATE POLICY "workspace_member_read_media"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (
    -- Allow if the user belongs to the workspace encoded in the first path segment
    EXISTS (
      SELECT 1
      FROM public.memberships wm
      WHERE wm.user_id = auth.uid()
        AND wm.is_active = TRUE
        AND wm.workspace_id::text = split_part(name, '/', 1)
    )
  )
);
