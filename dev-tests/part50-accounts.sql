-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part50 (grieviq-76): Accounts. GST tax invoices, credit notes, receipt and
-- refund vouchers (CGST Rules 46, 50, 51, 53), TDS on payments, months the
-- CA has filed, Razorpay settlements.
--
-- tax_docs: one row per document, never changed or deleted (2 triggers;
-- only the "emailed" time can be filled in). Numbers: prefix/FY/serial,
-- e.g. GIQ-R/26-27/0001 (at most 16 characters, one series per prefix,
-- starting again each 1 April). Amounts in paise.
--   kind   INVOICE | CREDIT_NOTE | RECEIPT_VOUCHER | REFUND_VOUCHER
--   series R (representatives' offices) | D (departments) | H (helpers)
--          | S (State and District dashboards) | N (National)
--   source BILL (bills.id) | HELPER_PAYMENT (helper_payments.id)
--   ref_doc_id the invoice a credit note cancels, or the receipt voucher an
--          invoice or refund voucher follows
-- bills.buyer_gstin: the office's GSTIN, if it has one (B2B invoice).
-- bill_payments.gst_tds / it_tds / tds_ref: tax a government buyer deducted
--   (GST TDS under section 51; income-tax TDS) and the certificate.
-- accounts_months: months the CA has filed ("locked").
-- razorpay_recon: Razorpay's settlement lines (fee, GST on the fee), matched
--   to GrievIQ's payments by the Razorpay payment id.
-- The settings (SAC codes, "tax invoices from" date, series prefixes) are in
-- admin_settings, key 'accounts'.
-- Triggers: 40 -> 42. Run ONCE ("already exists" / "duplicate column name" means it was done).

CREATE TABLE tax_docs (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('INVOICE','CREDIT_NOTE','RECEIPT_VOUCHER','REFUND_VOUCHER')),
  series          TEXT NOT NULL CHECK (series IN ('R','D','H','S','N')),
  prefix          TEXT NOT NULL,
  fy              TEXT NOT NULL,
  seq             INTEGER NOT NULL,
  number          TEXT NOT NULL UNIQUE,
  doc_date        TEXT NOT NULL,
  issued_at       TEXT NOT NULL,
  issued_by       TEXT NOT NULL,
  source_type     TEXT NOT NULL CHECK (source_type IN ('BILL','HELPER_PAYMENT')),
  source_id       TEXT NOT NULL,
  ref_doc_id      TEXT,
  party_name      TEXT NOT NULL,
  party_gstin     TEXT,
  party_email     TEXT,
  party_state     TEXT,
  supplier        TEXT NOT NULL,
  place_code      TEXT NOT NULL,
  sac             TEXT NOT NULL,
  description     TEXT NOT NULL,
  period_from     TEXT,
  period_to       TEXT,
  rate            REAL NOT NULL,
  taxable_paise   INTEGER NOT NULL,
  cgst_paise      INTEGER NOT NULL DEFAULT 0,
  sgst_paise      INTEGER NOT NULL DEFAULT 0,
  igst_paise      INTEGER NOT NULL DEFAULT 0,
  total_paise     INTEGER NOT NULL,
  reason          TEXT,
  view_key        TEXT NOT NULL,
  emailed_at      TEXT,
  UNIQUE (prefix, fy, seq),
  UNIQUE (kind, source_type, source_id)
);
CREATE INDEX idx_tax_docs_date ON tax_docs (doc_date);
CREATE INDEX idx_tax_docs_source ON tax_docs (source_type, source_id);
CREATE TRIGGER tax_docs_no_delete BEFORE DELETE ON tax_docs
BEGIN SELECT RAISE(ABORT, 'Tax documents cannot be deleted; issue a credit note.'); END;
CREATE TRIGGER tax_docs_no_change BEFORE UPDATE ON tax_docs
WHEN NEW.number IS NOT OLD.number OR NEW.kind IS NOT OLD.kind OR NEW.doc_date IS NOT OLD.doc_date OR NEW.party_name IS NOT OLD.party_name
  OR NEW.party_gstin IS NOT OLD.party_gstin OR NEW.taxable_paise IS NOT OLD.taxable_paise OR NEW.cgst_paise IS NOT OLD.cgst_paise
  OR NEW.sgst_paise IS NOT OLD.sgst_paise OR NEW.igst_paise IS NOT OLD.igst_paise OR NEW.total_paise IS NOT OLD.total_paise
  OR NEW.source_id IS NOT OLD.source_id OR NEW.ref_doc_id IS NOT OLD.ref_doc_id OR NEW.place_code IS NOT OLD.place_code OR NEW.sac IS NOT OLD.sac
  OR NEW.description IS NOT OLD.description OR NEW.supplier IS NOT OLD.supplier OR NEW.rate IS NOT OLD.rate OR NEW.reason IS NOT OLD.reason
  OR NEW.view_key IS NOT OLD.view_key OR NEW.seq IS NOT OLD.seq OR NEW.prefix IS NOT OLD.prefix OR NEW.fy IS NOT OLD.fy
BEGIN SELECT RAISE(ABORT, 'Tax documents cannot be changed; issue a credit note.'); END;

ALTER TABLE bills ADD COLUMN buyer_gstin TEXT;
ALTER TABLE bill_payments ADD COLUMN gst_tds INTEGER;
ALTER TABLE bill_payments ADD COLUMN it_tds INTEGER;
ALTER TABLE bill_payments ADD COLUMN tds_ref TEXT;

CREATE TABLE accounts_months (
  month      TEXT PRIMARY KEY,
  locked_at  TEXT NOT NULL,
  locked_by  TEXT NOT NULL,
  note       TEXT
);

CREATE TABLE razorpay_recon (
  id             TEXT PRIMARY KEY,
  month          TEXT NOT NULL,
  type           TEXT NOT NULL,
  entity_id      TEXT NOT NULL,
  amount_paise   INTEGER NOT NULL,
  fee_paise      INTEGER NOT NULL DEFAULT 0,
  tax_paise      INTEGER NOT NULL DEFAULT 0,
  settlement_id  TEXT,
  settlement_utr TEXT,
  settled_at     TEXT,
  matched_kind   TEXT,
  matched_ref    TEXT,
  fetched_at     TEXT NOT NULL,
  UNIQUE (type, entity_id)
);
CREATE INDEX idx_rzp_recon_month ON razorpay_recon (month);
