-- 0028_documents_pgcrypto.sql — SEC-3a: encrypt intake document text at rest.
--
-- Converts plaintext PHI columns on intake_documents and document_chunks to
-- pgcrypto bytea blobs. Application read/write uses pgp_sym_* with
-- PGCRYPTO_KEY_REF_DEV (falls back to PHI_ENCRYPTION_KEY).
--
-- Local apply: uses dev fallback when app.pgcrypto_key_dev GUC is unset.
-- Production migrate task: SET app.pgcrypto_key_dev from secrets manager first.
--
-- DOWN (manual rollback — requires decrypting back to TEXT; run only in dev):
--   ALTER TABLE intake_documents ADD COLUMN extracted_text TEXT;
--   ALTER TABLE document_chunks ADD COLUMN chunk_text TEXT;
--   ALTER TABLE document_chunks ADD COLUMN text_content TEXT;
--   UPDATE intake_documents SET extracted_text = pgp_sym_decrypt(extracted_text_encrypted, :key)::text
--     WHERE extracted_text_encrypted IS NOT NULL;
--   UPDATE document_chunks SET chunk_text = pgp_sym_decrypt(chunk_text_encrypted, :key)::text
--     WHERE chunk_text_encrypted IS NOT NULL;
--   ALTER TABLE intake_documents DROP COLUMN extracted_text_encrypted;
--   ALTER TABLE document_chunks DROP COLUMN chunk_text_encrypted;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

SELECT set_config(
  'app.pgcrypto_key_dev',
  coalesce(
    nullif(current_setting('app.pgcrypto_key_dev', true), ''),
    'dev_only_change_me_phi_crypt_key'
  ),
  false
);

ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS chunk_text_encrypted BYTEA;

ALTER TABLE intake_documents
  ADD COLUMN IF NOT EXISTS extracted_text_encrypted BYTEA;

DO $migrate$
DECLARE
  crypto_key TEXT := current_setting('app.pgcrypto_key_dev');
  has_chunk_text BOOLEAN;
  has_text_content BOOLEAN;
  has_extracted_text BOOLEAN;
BEGIN
  SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'document_chunks'
              AND column_name = 'chunk_text'
         ) INTO has_chunk_text;

  SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'document_chunks'
              AND column_name = 'text_content'
         ) INTO has_text_content;

  IF has_chunk_text AND has_text_content THEN
    UPDATE document_chunks
       SET chunk_text_encrypted = pgp_sym_encrypt(
             coalesce(chunk_text, text_content, ''),
             crypto_key
           )
     WHERE chunk_text_encrypted IS NULL;
  ELSIF has_chunk_text THEN
    UPDATE document_chunks
       SET chunk_text_encrypted = pgp_sym_encrypt(coalesce(chunk_text, ''), crypto_key)
     WHERE chunk_text_encrypted IS NULL;
  ELSIF has_text_content THEN
    UPDATE document_chunks
       SET chunk_text_encrypted = pgp_sym_encrypt(coalesce(text_content, ''), crypto_key)
     WHERE chunk_text_encrypted IS NULL;
  END IF;

  UPDATE document_chunks
     SET chunk_text_encrypted = pgp_sym_encrypt('', crypto_key)
   WHERE chunk_text_encrypted IS NULL;

  SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'intake_documents'
              AND column_name = 'extracted_text'
         ) INTO has_extracted_text;

  IF has_extracted_text THEN
    UPDATE intake_documents
       SET extracted_text_encrypted = pgp_sym_encrypt(extracted_text, crypto_key)
     WHERE extracted_text IS NOT NULL
       AND extracted_text <> ''
       AND extracted_text_encrypted IS NULL;
  END IF;
END
$migrate$;

ALTER TABLE document_chunks DROP COLUMN IF EXISTS chunk_text;
ALTER TABLE document_chunks DROP COLUMN IF EXISTS text_content;
ALTER TABLE intake_documents DROP COLUMN IF EXISTS extracted_text;

COMMENT ON COLUMN document_chunks.chunk_text_encrypted IS
  'pgcrypto-encrypted chunk body (SEC-3a). Decrypt server-side only.';

COMMENT ON COLUMN intake_documents.extracted_text_encrypted IS
  'pgcrypto-encrypted transcript/OCR text (SEC-3a). Decrypt server-side only.';
