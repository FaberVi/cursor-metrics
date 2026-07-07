import { local } from "./core.js";

const MESSAGES = {
  en: {
    title: "Cursor Usage",
    refresh: "Refresh",
    refreshing: "Refreshing\u2026",
    updated: "Updated",
    language: "Language",
    currency: "Currency",
    perPage: "{size}/page",
    eventsPerPage: "Events per page",
    eventOne: "event",
    eventMany: "events",
    noEventsInRange: "No events in this range",
    pageFirst: "First page",
    pagePrev: "Previous page",
    pageNext: "Next page",
    pageLast: "Last page",
    range1d: "Last 24 hours",
    range7d: "Last 7 days",
    range30d: "Last 30 days",
    rangeBilling: "Current Billing Cycle",
    sectionUsage: "Your Usage",
    sectionUsageDesc: "Per-day usage over the selected range",
    sectionPool: "Pool Usage",
    sectionPoolDesc: "Daily Auto and API pool consumption for the billing cycle",
    sectionBreakdown: "Usage by Model",
    sectionEvents: "Events",
    sectionConversations: "Conversations",
    tabEvents: "Events",
    tabConversations: "Conversations",
    previewTitles: "Fetch Titles (Preview)",
    previewLoading: "Loading titles\u2026",
    previewFound: "{titles} titles found for {conv} conversations",
    previewNoTitles: "No titles found in Cursor database ({conv} conversations)",
    previewError: "Could not load conversation titles",
    colConversation: "Conversation",
    colLastActive: "Last active",
    colModels: "Models",
    colCalls: "Calls",
    noConversation: "No conversation",
    noConversationsInRange: "No conversations in this range",
    conversationOne: "conversation",
    conversationMany: "conversations",
    showing: "Showing",
    of: "of",
    conversationsPerPage: "Conversations per page",
    archiveNote: "Local archive: {count} usage events stored in SQLite",
    filterUsage: "Usage:",
    filterMetric: "Metric:",
    filterAll: "All",
    filterIncluded: "Included",
    filterOnDemand: "On-Demand",
    metricSpend: "Spend",
    metricTokens: "Tokens",
    metricRequests: "Requests",
    exportCsv: "Export CSV",
    colModel: "Model",
    colRequests: "Requests",
    colTokens: "Tokens",
    colSpend: "Spend",
    colDate: "Date",
    colType: "Type",
    poolDailyPace: "Daily balance",
    poolDailyPaceDesc: "Positive bars = budget left that day; negative = overspend vs even spread until reset",
    poolChartNote:
      "Cumulative pool usage for the current billing cycle. The balance chart below shows daily budget headroom (+) or overspend (-) to reach reset without early depletion.",
    noData: "No data yet",
    includedRequests: "Included-Request Usage",
    onDemandUsage: "On-Demand Usage",
    includedPool: "Included Pool",
    totalUsed: "total used",
    unlimited: "Unlimited",
    onDemandFooter: "Pay for extra usage beyond your plan limits",
    projectedPace: "Projected 100% at current rate",
    todayPace: "Daily budget",
    currentPlan: "Current plan",
    enterprise: "Enterprise",
    teams: "Teams",
    personal: "Personal",
    alreadyExhausted: "Already at 100%",
    noUsageYet: "No usage yet",
    leftToday: "left today",
    overPace: "over budget",
    onPace: "On budget",
    left: "left",
    over: "over",
    onPaceShort: "On budget",
    eventDetails: "Event details",
    conversationDetails: "Conversation details",
    convFirstActive: "First activity",
    convLastActive: "Last activity",
    convEventList: "Events in this conversation",
    convClickEvent: "Click an event for token breakdown",
    convMessages: "Messages",
    convMessagesLoading: "Loading messages from Cursor database\u2026",
    convMessagesEmpty: "No messages found in Cursor database for this conversation",
    convMessagesError: "Could not load messages from Cursor database",
    msgRoleUser: "You",
    msgRoleAssistant: "Assistant",
    msgModelEstimated: "Model inferred from nearest usage event",
    closeEventDetails: "Close event details",
    toggleUsage: "Toggle Your Usage section",
    togglePool: "Toggle Pool Usage section",
    toggleBreakdown: "Toggle Usage by Model section",
    toggleEvents: "Toggle Events section",
    toggleConversations: "Toggle Conversations section",
    perDay: "/day",
    helpIncludedRequests:
      "Premium requests included in your plan for the current billing cycle. Agent and Composer usage counts against this quota before any on-demand charges apply.",
    helpOnDemand:
      "Usage billed beyond your included quota when usage-based pricing is enabled. Spend is charged to your payment method; on team accounts an admin may set a hard limit.",
    helpIncludedPool:
      "Share of your included usage pool by routing mode. Auto reflects Cursor's automatic model selection; API reflects models you choose explicitly. Total is the combined pool consumption.",
    helpPoolDepletion:
      "Estimated date each pool reaches 100% based on average daily consumption since the billing cycle started. If usage stays at the same rate, this is when the pool would run out before reset.",
    helpPoolPace:
      "Indicative daily budget to spread pool usage evenly until billing reset. Residual shows how much you could still use today; a negative value means you exceeded today's budget.",
    recommendedPace: "Target usage",
    recommendedPaceDesc: "Even spread until reset — compare target vs actual usage",
    recTarget: "target",
    usedLabel: "used",
    poolUsageDay: "Pool usage (day)",
    helpPoolRecommended:
      "Target cumulative pool usage if spread evenly across the billing cycle. Bars show where you should be today; compare with your actual usage above.",
  },
  it: {
    title: "Utilizzo Cursor",
    refresh: "Aggiorna",
    refreshing: "Aggiornamento\u2026",
    updated: "Aggiornato",
    language: "Lingua",
    currency: "Valuta",
    perPage: "{size}/pagina",
    eventsPerPage: "Eventi per pagina",
    eventOne: "evento",
    eventMany: "eventi",
    noEventsInRange: "Nessun evento in questo intervallo",
    pageFirst: "Prima pagina",
    pagePrev: "Pagina precedente",
    pageNext: "Pagina successiva",
    pageLast: "Ultima pagina",
    range1d: "Ultime 24 ore",
    range7d: "Ultimi 7 giorni",
    range30d: "Ultimi 30 giorni",
    rangeBilling: "Ciclo di fatturazione corrente",
    sectionUsage: "Il tuo utilizzo",
    sectionUsageDesc: "Utilizzo giornaliero nell'intervallo selezionato",
    sectionPool: "Utilizzo pool",
    sectionPoolDesc: "Consumo giornaliero pool Auto e API nel ciclo di fatturazione",
    sectionBreakdown: "Utilizzo per modello",
    sectionEvents: "Eventi",
    sectionConversations: "Conversazioni",
    tabEvents: "Eventi",
    tabConversations: "Conversazioni",
    previewTitles: "Recupera Titoli (Preview)",
    previewLoading: "Caricamento titoli\u2026",
    previewFound: "{titles} titoli trovati per {conv} conversazioni",
    previewNoTitles: "Nessun titolo nel database Cursor ({conv} conversazioni)",
    previewError: "Impossibile caricare i titoli delle conversazioni",
    colConversation: "Conversazione",
    colLastActive: "Ultima attività",
    colModels: "Modelli",
    colCalls: "Chiamate",
    noConversation: "Senza conversazione",
    noConversationsInRange: "Nessuna conversazione in questo intervallo",
    conversationOne: "conversazione",
    conversationMany: "conversazioni",
    showing: "Visualizzati",
    of: "di",
    conversationsPerPage: "Conversazioni per pagina",
    archiveNote: "Archivio locale: {count} eventi di utilizzo salvati in SQLite",
    filterUsage: "Utilizzo:",
    filterMetric: "Metrica:",
    filterAll: "Tutto",
    filterIncluded: "Incluso",
    filterOnDemand: "On-Demand",
    metricSpend: "Spesa",
    metricTokens: "Token",
    metricRequests: "Richieste",
    exportCsv: "Esporta CSV",
    colModel: "Modello",
    colRequests: "Richieste",
    colTokens: "Token",
    colSpend: "Spesa",
    colDate: "Data",
    colType: "Tipo",
    poolDailyPace: "Saldo giornaliero",
    poolDailyPaceDesc: "Barre positive = budget residuo del giorno; negative = superamento del budget giornaliero rispetto alla distribuzione uniforme",
    poolChartNote:
      "Utilizzo cumulativo del pool nel ciclo corrente. Il grafico sotto mostra il margine giornaliero (+) o il superamento (-) rispetto al budget per arrivare al reset senza esaurire il pool in anticipo.",
    noData: "Nessun dato",
    includedRequests: "Richieste incluse",
    onDemandUsage: "Utilizzo on-demand",
    includedPool: "Pool incluso",
    totalUsed: "totale usato",
    unlimited: "Illimitato",
    onDemandFooter: "Spesa extra oltre i limiti del piano",
    projectedPace: "100% stimato al consumo medio",
    todayPace: "Budget giornaliero",
    currentPlan: "Piano attuale",
    enterprise: "Enterprise",
    teams: "Teams",
    personal: "Personale",
    alreadyExhausted: "Gi\u00e0 al 100%",
    noUsageYet: "Nessun utilizzo",
    leftToday: "rimasti oggi",
    overPace: "oltre soglia",
    onPace: "Nei limiti",
    left: "rimasti",
    over: "oltre soglia",
    onPaceShort: "Nei limiti",
    eventDetails: "Dettagli evento",
    conversationDetails: "Dettagli conversazione",
    convFirstActive: "Prima attivit\u00e0",
    convLastActive: "Ultima attivit\u00e0",
    convEventList: "Eventi in questa conversazione",
    convClickEvent: "Clicca un evento per il dettaglio token",
    convMessages: "Messaggi",
    convMessagesLoading: "Caricamento messaggi dal database Cursor\u2026",
    convMessagesEmpty: "Nessun messaggio trovato nel database Cursor per questa conversazione",
    convMessagesError: "Impossibile caricare i messaggi dal database Cursor",
    msgRoleUser: "Tu",
    msgRoleAssistant: "Assistente",
    msgModelEstimated: "Modello stimato dall'evento di utilizzo più vicino",
    closeEventDetails: "Chiudi dettagli evento",
    toggleUsage: "Mostra/nascondi sezione Il tuo utilizzo",
    togglePool: "Mostra/nascondi sezione Utilizzo pool",
    toggleBreakdown: "Mostra/nascondi sezione Utilizzo per modello",
    toggleEvents: "Mostra/nascondi sezione Eventi",
    toggleConversations: "Mostra/nascondi sezione Conversazioni",
    perDay: "/giorno",
    helpIncludedRequests:
      "Richieste premium incluse nel piano per il ciclo di fatturazione corrente. L'utilizzo di Agent e Composer conta su questa quota prima degli addebiti on-demand.",
    helpOnDemand:
      "Utilizzo fatturato oltre la quota inclusa quando il pricing a consumo \u00e8 attivo. L'importo viene addebitato sul metodo di pagamento; sui team un admin pu\u00f2 impostare un limite.",
    helpIncludedPool:
      "Quota del pool incluso per modalit\u00e0 di routing. Auto = selezione automatica del modello; API = modelli scelti esplicitamente. Il totale \u00e8 il consumo combinato.",
    helpPoolDepletion:
      "Data stimata in cui ogni pool raggiunge il 100% in base al consumo medio giornaliero dall'inizio del ciclo. Se il consumo resta uguale, \u00e8 quando il pool si esaurirebbe prima del reset.",
    helpPoolPace:
      "Budget giornaliero indicativo per distribuire il pool fino al reset. Il residuo indica quanto puoi ancora usare oggi; un valore negativo significa che hai superato il budget di oggi.",
    recommendedPace: "Obiettivo cumulativo",
    recommendedPaceDesc: "Distribuzione uniforme fino al reset — confronta obiettivo vs utilizzo reale",
    recTarget: "obiettivo",
    usedLabel: "usato",
    poolUsageDay: "Pool (giorno)",
    helpPoolRecommended:
      "Utilizzo cumulativo target se distribuito uniformemente nel ciclo. Le barre mostrano dove dovresti essere oggi; confronta con l'utilizzo reale sopra.",
  },
};

const STATIC_I18N = {
  "range.1d": "range1d",
  "range.7d": "range7d",
  "range.30d": "range30d",
  "range.billingCycle": "rangeBilling",
  "section.usage.title": "sectionUsage",
  "section.usage.desc": "sectionUsageDesc",
  "section.pool.title": "sectionPool",
  "section.pool.desc": "sectionPoolDesc",
  "section.breakdown.title": "sectionBreakdown",
  "tab.events": "tabEvents",
  "tab.conversations": "tabConversations",
  "preview.titles": "previewTitles",
  "col.conversation": "colConversation",
  "col.lastActive": "colLastActive",
  "col.models": "colModels",
  "col.calls": "colCalls",
  "filter.usage.label": "filterUsage",
  "filter.metric.label": "filterMetric",
  "filter.all": "filterAll",
  "filter.included": "filterIncluded",
  "filter.ondemand": "filterOnDemand",
  "metric.spend": "metricSpend",
  "metric.tokens": "metricTokens",
  "metric.requests": "metricRequests",
  "export.csv": "exportCsv",
  "col.model": "colModel",
  "col.requests": "colRequests",
  "col.tokens": "colTokens",
  "col.spend": "colSpend",
  "col.date": "colDate",
  "col.type": "colType",
  "pool.pace.title": "poolDailyPace",
  "pool.pace.desc": "poolDailyPaceDesc",
  "event.details": "eventDetails",
};

export function t(key) {
  const locale = local.locale in MESSAGES ? local.locale : "en";
  return MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key;
}

export function cardHelpText(key) {
  const map = {
    includedRequests: "helpIncludedRequests",
    onDemand: "helpOnDemand",
    includedPool: "helpIncludedPool",
    poolDepletion: "helpPoolDepletion",
    poolPace: "helpPoolPace",
    poolRecommended: "helpPoolRecommended",
  };
  return t(map[key] || key);
}

export function getDateLocale() {
  return local.locale === "it" ? "it-IT" : "en-US";
}

export function applyStaticTranslations() {
  document.documentElement.lang = local.locale === "it" ? "it" : "en";

  const titleEl = document.querySelector(".dashboard-header h1");
  if (titleEl) titleEl.textContent = t("title");

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = STATIC_I18N[el.dataset.i18n] || el.dataset.i18n;
    el.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });

  const refreshBtn = document.getElementById("refresh-btn");
  if (refreshBtn && !refreshBtn.disabled) {
    refreshBtn.textContent = t("refresh");
  }

  const langSelect = document.getElementById("lang-select");
  if (langSelect) {
    langSelect.value = local.locale;
    langSelect.setAttribute("aria-label", t("language"));
  }

  const currencySelect = document.getElementById("currency-select");
  if (currencySelect) {
    currencySelect.value = local.currency === "eur" ? "eur" : "usd";
    currencySelect.setAttribute("aria-label", t("currency"));
  }

  const poolNote = document.getElementById("pool-chart-note");
  if (poolNote) poolNote.textContent = t("poolChartNote");
}
