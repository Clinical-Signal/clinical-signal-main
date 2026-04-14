-- 0003_seed_dev.sql — synthetic dev data. Safe to run multiple times.
--
-- Seeds a dev practitioner (login: dev@example.com / password: devpassword12!)
-- and 3 synthetic functional-health patients spanning different clinical
-- patterns. All PHI fields are encrypted with the dev PHI key; the app
-- decrypts at read time using the same key from PHI_ENCRYPTION_KEY.

\connect clinical_signal

-- Dev PHI key is hard-coded here ONLY for the local dev seed. Production uses
-- a KMS-backed key supplied per-request by the app; this file is gated on
-- NODE_ENV=development via the wrapper init script.
DO $seed$
DECLARE
  dev_key TEXT := 'dev_only_change_me_phi_crypt_key';
  dev_tenant UUID := '00000000-0000-0000-0000-000000000001';
  dev_practitioner UUID;
BEGIN
  -- Idempotent practitioner. pgcrypto's crypt() emits bcrypt hashes that
  -- bcryptjs verifies.
  INSERT INTO practitioners (tenant_id, email_lower, email, password_hash, name, role)
  VALUES (
    dev_tenant,
    'dev@example.com',
    'dev@example.com',
    crypt('devpassword12!', gen_salt('bf', 12)),
    'Dev Practitioner',
    'owner'
  )
  ON CONFLICT (email_lower) DO NOTHING;

  SELECT id INTO dev_practitioner FROM practitioners WHERE email_lower = 'dev@example.com';

  -- Patient 1: HPA-axis / adrenal dysregulation pattern
  INSERT INTO patients (
    tenant_id, practitioner_id, name_encrypted, dob_encrypted,
    name_search_hash, status, intake_data, notes
  )
  SELECT
    dev_tenant, dev_practitioner,
    pgp_sym_encrypt('Sarah Chen', dev_key),
    pgp_sym_encrypt('1985-03-14', dev_key),
    encode(digest(lower('sarah chen'), 'sha256'), 'hex'),
    'labs_pending',
    jsonb_build_object(
      'chief_complaints', ARRAY['chronic fatigue','afternoon energy crashes','poor sleep'],
      'symptoms', jsonb_build_object(
        'sleep', 'wakes at 3am, cannot return to sleep',
        'energy', 'high morning fatigue, caffeine-dependent',
        'mood', 'anxiety, feeling wired-but-tired',
        'digestion', 'occasional bloating'
      ),
      'history', ARRAY['post-viral fatigue 2022','high-stress corporate role'],
      'goals', ARRAY['restore energy','sleep through the night','reduce anxiety'],
      'lifestyle', jsonb_build_object(
        'sleep_hours', 6,
        'exercise', 'sporadic HIIT, currently skipping',
        'diet', 'high-protein, skips breakfast'
      ),
      'previous_labs', ARRAY['TSH 2.1','ferritin 28','cortisol AM wnl']
    ),
    'Classic HPA-axis dysregulation presentation. Consider DUTCH + full thyroid panel.'
  WHERE NOT EXISTS (
    SELECT 1 FROM patients
     WHERE tenant_id = dev_tenant
       AND name_search_hash = encode(digest(lower('sarah chen'), 'sha256'), 'hex')
  );

  -- Patient 2: Gut dysfunction / food sensitivity pattern
  INSERT INTO patients (
    tenant_id, practitioner_id, name_encrypted, dob_encrypted,
    name_search_hash, status, intake_data, notes
  )
  SELECT
    dev_tenant, dev_practitioner,
    pgp_sym_encrypt('Marcus Alvarez', dev_key),
    pgp_sym_encrypt('1978-11-02', dev_key),
    encode(digest(lower('marcus alvarez'), 'sha256'), 'hex'),
    'intake_pending',
    jsonb_build_object(
      'chief_complaints', ARRAY['chronic bloating','brain fog','skin flare-ups'],
      'symptoms', jsonb_build_object(
        'digestion', 'bloating after most meals, irregular BMs',
        'skin', 'eczema on hands, intermittent',
        'cognition', 'post-meal brain fog',
        'joints', 'morning stiffness'
      ),
      'history', ARRAY['frequent antibiotics in childhood','IBS diagnosis 2018'],
      'goals', ARRAY['eliminate bloating','clear skin','stable energy'],
      'lifestyle', jsonb_build_object(
        'diet', 'standard American, high dairy and gluten',
        'stress', 'moderate, small business owner',
        'sleep_hours', 7
      ),
      'previous_labs', ARRAY['CBC wnl','no GI-MAP done']
    ),
    'Suspect intestinal permeability + dysbiosis. Recommend GI-MAP stool test and food-sensitivity panel.'
  WHERE NOT EXISTS (
    SELECT 1 FROM patients
     WHERE tenant_id = dev_tenant
       AND name_search_hash = encode(digest(lower('marcus alvarez'), 'sha256'), 'hex')
  );

  -- Patient 3: Subclinical thyroid / perimenopause pattern
  INSERT INTO patients (
    tenant_id, practitioner_id, name_encrypted, dob_encrypted,
    name_search_hash, status, intake_data, notes
  )
  SELECT
    dev_tenant, dev_practitioner,
    pgp_sym_encrypt('Priya Natarajan', dev_key),
    pgp_sym_encrypt('1974-07-21', dev_key),
    encode(digest(lower('priya natarajan'), 'sha256'), 'hex'),
    'new',
    jsonb_build_object(
      'chief_complaints', ARRAY['weight gain','cold intolerance','irregular cycles'],
      'symptoms', jsonb_build_object(
        'energy', 'afternoon fatigue',
        'temperature', 'persistently cold extremities',
        'hair', 'thinning over past year',
        'cycles', 'shorter luteal phase, heavier flow'
      ),
      'history', ARRAY['family history of Hashimoto''s','2 pregnancies'],
      'goals', ARRAY['understand hormonal shifts','maintain weight','restore hair'],
      'lifestyle', jsonb_build_object(
        'diet', 'vegetarian, low protein intake',
        'exercise', 'yoga 3x/week',
        'sleep_hours', 7
      ),
      'previous_labs', ARRAY['TSH 3.8','no free T3/T4 on file']
    ),
    'Likely subclinical hypothyroid + perimenopausal transition. Full thyroid + sex hormone panel indicated.'
  WHERE NOT EXISTS (
    SELECT 1 FROM patients
     WHERE tenant_id = dev_tenant
       AND name_search_hash = encode(digest(lower('priya natarajan'), 'sha256'), 'hex')
  );
END
$seed$;
