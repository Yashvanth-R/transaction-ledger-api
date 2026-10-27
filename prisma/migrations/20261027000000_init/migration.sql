CREATE TABLE "accounts" (
  "id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accounts_balance_nonnegative" CHECK ("balance" >= 0)
);

CREATE TABLE "transactions" (
  "id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "type" VARCHAR(6) NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "description" VARCHAR(500) NOT NULL DEFAULT '',
  "reference_id" VARCHAR(150) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "transactions_type_valid" CHECK ("type" IN ('credit', 'debit')),
  CONSTRAINT "transactions_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "transactions_account_id_reference_id_key" ON "transactions"("account_id", "reference_id");
CREATE INDEX "transactions_account_id_created_at_idx" ON "transactions"("account_id", "created_at" DESC);

CREATE FUNCTION reject_transaction_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'transactions are immutable' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "transactions_immutable" BEFORE UPDATE OR DELETE ON "transactions"
FOR EACH ROW EXECUTE FUNCTION reject_transaction_mutation();
