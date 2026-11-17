CREATE TABLE IF NOT EXISTS member_referral_codes (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_referral_codes_code_format CHECK (code ~ '^[A-HJ-NP-Z2-9]{10}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS member_referral_codes_owner_unique
  ON member_referral_codes (owner_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS member_referral_codes_code_unique
  ON member_referral_codes (code);

CREATE TABLE IF NOT EXISTS member_referral_attributions (
  id text PRIMARY KEY,
  code_id text NOT NULL REFERENCES member_referral_codes(id) ON DELETE RESTRICT,
  referrer_user_id text NOT NULL,
  referred_user_id text NOT NULL,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_referral_attributions_not_self CHECK (referrer_user_id <> referred_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS member_referral_attributions_referred_unique
  ON member_referral_attributions (referred_user_id);
CREATE INDEX IF NOT EXISTS member_referral_attributions_referrer_date
  ON member_referral_attributions (referrer_user_id, attributed_at);
