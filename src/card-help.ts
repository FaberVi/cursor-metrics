export const CARD_HELP = {
  includedRequests:
    "Premium requests included in your plan for the current billing cycle. Agent and Composer usage counts against this quota before any on-demand charges apply.",
  onDemand:
    "Usage billed beyond your included quota when usage-based pricing is enabled. Spend is charged to your payment method; on team accounts an admin may set a hard limit.",
  includedPool:
    "Share of your included usage pool by routing mode. Auto reflects Cursor's automatic model selection; API reflects models you choose explicitly. Total is the combined pool consumption.",
  poolDepletion:
    "Estimated date each pool reaches 100% based on average daily consumption since the billing cycle started. If usage stays at the same rate, this is when the pool would run out before reset.",
  poolPace:
    "Indicative daily budget to spread pool usage evenly until billing reset. Residual shows how much you could still use today; a negative value means you exceeded today's budget.",
} as const;

export type CardHelpKey = keyof typeof CARD_HELP;
