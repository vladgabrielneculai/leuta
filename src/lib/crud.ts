export const TABLES: Record<string, { columns: string[]; filters: string[]; order: string }> = {
  categories: { columns: ["name", "kind", "bucket", "color"], filters: ["kind"], order: "kind, name" },
  entries: {
    columns: ["month", "kind", "category_id", "goal_id", "investment_id", "description", "amount", "currency", "recurring"],
    filters: ["month", "kind", "goal_id", "investment_id"],
    order: "id",
  },
  goals: { columns: ["name", "type", "target", "initial", "deadline", "color"], filters: ["type"], order: "type DESC, id" },
  investments: { columns: ["name", "type", "expected_return"], filters: [], order: "id" },
  loans: {
    columns: [
      "name", "bank", "principal", "start_date", "term_months", "schedule_type", "fixed_rate", "fixed_months",
      "margin", "ircc", "fee_fixed_pct", "fee_variable_pct", "insurance_monthly", "strategy", "active",
      "already_paid_principal", "already_paid_interest",
    ],

    filters: [],
    order: "id",
  },
  loan_prepayments: { columns: ["loan_id", "month", "amount", "strategy", "note"], filters: ["loan_id"], order: "month" },
  planned_purchases: {
    columns: [
      "name",
      "category",
      "total_price",
      "financing_type",
      "down_payment",
      "loan_term_months",
      "loan_interest_rate",
      "target_date",
      "priority",
      "notes",
      "created_at",
    ],
    filters: ["financing_type", "priority"],
    order: "id DESC",
  },
};
