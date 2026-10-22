-- Corrections (G-015, D-17, G-021) record what people changed in a lead file and why. They are the evidence for
-- confirmed opt-outs and managed status, so they are append-only like the audit log: no UPDATE, DELETE or TRUNCATE
-- for the app role, and the trigger binds the owner too (only the purge path, as owner with app.allow_purge, may
-- delete, with the upload). Reps see the corrections to rows they owned when the correction was made (G-014);
-- managers see the unit's.
ALTER TABLE corrections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY corrections_owner ON corrections
  USING (business_unit_id = app_bu() AND app_owns(owner_email)) WITH CHECK (business_unit_id = app_bu() AND app_owns(owner_email));
--> statement-breakpoint
CREATE TRIGGER corrections_append_only BEFORE UPDATE OR DELETE ON corrections FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER corrections_no_truncate BEFORE TRUNCATE ON corrections FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
GRANT SELECT, INSERT ON corrections TO demandai_app;
--> statement-breakpoint

-- An upload is kept while corrections refer to it: deleting it would have to delete them. A rep sees only the
-- corrections to their own rows, so deleting a list asks this for the whole unit.
CREATE FUNCTION upload_has_corrections(p_upload uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM corrections WHERE upload_id = p_upload AND business_unit_id = app_bu());
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION upload_has_corrections(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION upload_has_corrections(uuid) TO demandai_app;
