-- Hand-written (D-46): an approved claim goes into a message word for word, without a citation. Messages and Content
-- studio pieces written before still end a claim with one ("… within one planned shutdown. [Case study, 2025]").
-- A message nobody has answered yet gets a next version without it, made by the system (drafts are append-only: the
-- versions before, and the decision log's record of what was approved, stay as they were); a message with an outcome
-- stays as it went out. A studio piece is changed in place, as an edit would be. The pattern is checkDraft's: "[…, year]".
WITH cited AS (
  SELECT d.* FROM recommendations r
  JOIN drafts d ON d.recommendation_id = r.id AND d.version = r.draft_version
  WHERE r.outcome IS NULL
    AND (coalesce(d.draft->>'body', '') || ' ' || coalesce(d.draft->>'note', '')) ~ '\[[^]"\\[]+, [0-9]{4}\]'
), cleaned AS (
  SELECT c.*,
    regexp_replace(c.draft->>'body', ' ?\[[^]"\\[]+, [0-9]{4}\]', '', 'g') AS body,
    regexp_replace(c.draft->>'note', ' ?\[[^]"\\[]+, [0-9]{4}\]', '', 'g') AS note
  FROM cited c
), added AS (
  INSERT INTO drafts (business_unit_id, recommendation_id, version, channel, action, contact_row, draft, checks, confidence,
                      reason, ai_assisted, ai_call_id, brand_version_id, created_by)
  SELECT business_unit_id, recommendation_id, version + 1, channel, action, contact_row,
    draft
      || CASE WHEN body IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('body', body,
           'words', (SELECT count(*) FROM regexp_split_to_table(body, '\s+') w WHERE w <> '')) END
      || CASE WHEN note IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('note', note) END,
    -- The claims are verified by their words, so the checks and the confidence are the same without the citation.
    checks, confidence, 'Citation removed from the approved claim (D-46)', ai_assisted, ai_call_id, brand_version_id,
    '00000000-0000-0000-0000-000000000001'
  FROM cleaned
  RETURNING recommendation_id, version
)
UPDATE recommendations r SET draft_version = a.version, updated_at = now(), updated_by = '00000000-0000-0000-0000-000000000001'
FROM added a WHERE r.id = a.recommendation_id;
--> statement-breakpoint
-- The citation never holds a quote or a backslash, so taking it out of the JSON text leaves valid JSON. A newer rev
-- makes an editor open on the old text ask before saving over it.
UPDATE studio_items
SET blocks = regexp_replace(blocks::text, ' ?\[[^]"\\[]+, [0-9]{4}\]', '', 'g')::jsonb,
  rev = rev + 1, updated_at = now(), updated_by = '00000000-0000-0000-0000-000000000001'
WHERE blocks::text ~ '\[[^]"\\[]+, [0-9]{4}\]';
