-- 24h window guard trigger (SEC-04)
-- Blocks outbound free text when conversation window has expired.
-- override_admin flag in message.meta bypasses the guard for admin role
-- and logs a WINDOW_OVERRIDE event.
CREATE OR REPLACE FUNCTION public.check_outbound_24h_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conv_window_expires_at TIMESTAMPTZ;
  conv_workspace_id UUID;
BEGIN
  -- Only enforce on outbound non-template messages
  IF NEW.direction <> 'out' OR NEW.type = 'template' THEN
    RETURN NEW;
  END IF;

  SELECT window_expires_at, workspace_id
    INTO conv_window_expires_at, conv_workspace_id
    FROM public.conversations
   WHERE id = NEW.conversation_id;

  -- No window set (null) → allow (first interaction)
  IF conv_window_expires_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Window open → allow
  IF NOW() <= conv_window_expires_at THEN
    RETURN NEW;
  END IF;

  -- Window expired: check for admin override flag
  IF (NEW.meta ->> 'override_admin')::boolean IS TRUE THEN
    -- Log the override event
    INSERT INTO public.events (workspace_id, conversation_id, type, level, payload)
    VALUES (
      conv_workspace_id,
      NEW.conversation_id,
      'WINDOW_OVERRIDE',
      'warn',
      jsonb_build_object('sender_user_id', NEW.sender_user_id, 'body_preview', left(COALESCE(NEW.body,''), 40))
    );
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'WINDOW_EXPIRED: free text outside 24h window. Use an approved template.';
END;
$$;

CREATE TRIGGER trg_messages_24h_window
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.check_outbound_24h_window();
