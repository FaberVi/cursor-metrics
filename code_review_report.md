# 🔍 Revisione Staging

**Intento**: Espandere cursor-metrics (v0.5.18) con archivio locale eventi SQLite, tab Conversazioni con titoli/messaggi dal DB Cursor (sql.js), i18n IT/EN, selettore valuta USD/EUR su dashboard/status bar/tooltip, e refactor del layer API usage.

**Branch**: `main` (working tree non committato)
**File modificati**: 52 file (+2622, -158)
**Copertura review**: 18/52 file analizzati in profondità (moduli core `src/`, dashboard webview, store SQLite, sicurezza messaggi). 34 file a basso rischio campionati (test, CSS, script dev esclusi dal VSIX). Diff totale 4022 righe — strategia campionata per risk_classification del gather script.
**Distribuzione finding**: 0 CRITICA, 2 ALTA, 5 MEDIA, 3 BASSA
**Verdetto**: 🟡 PRONTO CON RISERVE

---

## Problemi di completezza (cose lasciate in sospeso)

### C-1: `conversation-aggregate.ts` non è usato nel flusso reale — Severità: MEDIA
**File**: `src/conversation-aggregate.ts` (intero modulo)
**Cosa manca**: La logica di aggregazione conversazioni esiste lato extension (`conversation-aggregate.ts` + test) ma la dashboard reimplementa tutto in `media/dashboard/modules/conversations.js` (`aggregateConversations()` locale). Le due implementazioni divergono già sul calcolo spesa: server somma `spendCents`, client usa `eventSpendDollars(e) * 100` con `quotaAwareEventDisplay`.
**Impatto se rilasciato così com'è**: I totali conversazione in UI possono non combaciare con eventuali consumer futuri lato host; ogni fix va applicato due volte e una delle due copie resterà stale.
**Sistemazione proposta**:
```typescript
// In buildDashboardState o postState, pre-calcolare summaries lato host:
import { aggregateConversations } from "./conversation-aggregate";

// dashboard-state.ts — aggiungere conversations: ConversationSummary[] allo state
// conversations.js — usare refs.state.conversations invece di aggregateConversations() locale
```

### C-2: CHANGELOG non aggiornato per le feature 0.5.18 — Severità: BASSA
**File**: `CHANGELOG.md`
**Cosa manca**: Nessuna voce per conversazioni, archivio SQLite, i18n/valuta, lettura DB Cursor.
**Impatto se rilasciato così com'è**: Release note incomplete per utenti e reviewer del marketplace.

---

## Problemi di stabilità (cose che potrebbero rompersi)

### S-1: Fingerprint eventi troppo debole — eventi distinti scartati silenziosamente — Severità: ALTA
**File**: `src/usage-event-fingerprint.ts` (righe 3-14), `src/usage-event-store.ts` (righe 93-99)
**Cosa può andare storto**: `INSERT OR IGNORE` usa una chiave che ignora `cacheReadTokens`, `cacheWriteTokens`, `maxMode`, `isChargeable`, ecc. Due eventi API distinti con stesso timestamp/modello/kind/token totali ma costi diversi collidono: il secondo non viene mai persistito.
**Impatto**: Archivio locale incompleto; tab Eventi/Conversazioni e grafici sotto-rappresentano l'utilizzo reale senza errore visibile.
**Sistemazione proposta**:
```typescript
// src/usage-event-fingerprint.ts
import { createHash } from "crypto";

export function usageEventFingerprint(event: UsageEvent): string {
  const payload = JSON.stringify({
    timestamp: event.timestamp,
    model: event.model,
    kind: event.kind,
    conversationId: event.conversationId ?? "",
    totalTokens: event.totalTokens,
    requests: event.requests,
    spendCents: event.spendCents,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    cacheWriteTokens: event.cacheWriteTokens,
    cacheReadTokens: event.cacheReadTokens,
    tokenCostCents: event.tokenCostCents,
    maxMode: event.maxMode,
    isChargeable: event.isChargeable,
  });
  return createHash("sha256").update(payload).digest("hex");
}
```

### S-2: Lettura DB Cursor senza gestione errori nel handler messaggi — Severità: ALTA
**File**: `src/dashboard-panel.ts` (righe 120-133), `src/cursor-state-db.ts` (righe 45-58)
**Cosa può andare storto**: `readFileSync(state.vscdb)` o `initSqlJs` possono fallire se Cursor tiene il file locked (comune su Windows) o se il DB è corrotto. L'handler `getConversationMessages` non ha `try/catch`: la promise rifiuta, il webview resta su "Caricamento messaggi…" per sempre.
**Impatto**: UX rotta al click su una conversazione; nessun feedback all'utente.
**Sistemazione proposta**:
```typescript
} else if (msg.type === "getConversationMessages" && typeof msg.conversationId === "string") {
  try {
    const conversationEvents = getState()?.events.filter(
      (event) => event.conversationId === msg.conversationId,
    ) ?? [];
    const messages = await loadConversationMessages(
      msg.conversationId,
      this.context.extensionPath,
      conversationEvents,
    );
    this.panel.webview.postMessage({
      type: "conversationMessages",
      conversationId: msg.conversationId,
      messages,
    });
  } catch (err) {
    this.panel.webview.postMessage({
      type: "conversationMessages",
      conversationId: msg.conversationId,
      messages: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
```
E in `conversations.js` `applyConversationMessages`, gestire `msg.error` mostrando `previewError` o stringa dedicata.

### S-3: `enrichUsageFromEvents` usa il batch API, non l'archivio completo — Severità: MEDIA
**File**: `src/extension.ts` (righe 369-397)
**Cosa può andare storto**: Dopo `loadStoredEvents()` (120 giorni), `enrichUsageFromEvents` riceve ancora `eventsResult.value` (solo l'ultimo fetch paginato). Se lo store contiene più eventi del ciclo corrente rispetto al fetch corrente, i contatori inclusi in status bar possono restare a 0/0 pur avendo dati in dashboard.
**Impatto**: Status bar e tooltip con numeri inclusi errati in edge case di sync parziale o primo avvio con store pre-popolato.
**Sistemazione proposta**:
```typescript
// Dopo loadStoredEvents():
const enriched = enrichUsageFromEvents(data, lastEvents ?? [], Date.now());
```

---

## Problemi di sicurezza

Nessun finding bloccante. Verificato:

- Messaggi conversazione renderizzati con `escapeHtml` su testo, modello e ruolo (`conversations.js` righe 239-252).
- Titoli conversazione in tabella escaped (`escapeHtml(row.label)`).
- CSV export con guard formula injection (`test/dashboard-security.spec.ts`).
- Query SQLite parametrizzate (`cursor-state-db.ts`, `conversation-messages.ts`).
- CSP webview restrittiva con nonce (`dashboard-panel.ts` righe 192-199).

**Nota**: `scripts/probe-bubble-models.ts` contiene un `conversationId` reale hardcoded — escluso dal VSIX (`.vscodeignore` → `scripts/`) ma resta nel repo git. Valutare rimozione prima del push pubblico.

---

## Problemi di performance

### P-1: `persist()` riscrive l'intero DB SQLite ad ogni sync — Severità: MEDIA
**File**: `src/usage-event-store.ts` (righe 90-132, 175-178)
**Problema**: Ogni `upsertEvents` (fino a `MAX_STORE_SYNC_PAGES = 100` pagine API) chiama `writeFileSync` dell'intero export sql.js.
**Impatto**: Refresh lenti e I/O disco elevato su Windows; possibile freeze UI extension host con migliaia di eventi.
**Sistemazione proposta**: Debounce `persist()` (es. 500ms), oppure `persist()` solo a fine batch in `updateUsage`, non per ogni chiamata interna.

### P-2: `postState` invia l'intero array `events` alla webview ad ogni refresh — Severità: MEDIA
**File**: `src/extension.ts` (righe 468-479, 412), `src/dashboard-state.ts` (righe 26-41)
**Problema**: Con 120 giorni di eventi archiviati, il payload JSON cresce linearmente; ogni poll/refresh serializza e deserializza tutto.
**Impatto**: Dashboard lenta ad aprirsi/aggiornarsi; memoria webview elevata.
**Sistemazione proposta**: Paginare lato host (inviare solo eventi nel range attivo) o inviare summary + endpoint lazy per dettaglio.

---

## Problemi frontend

### F-1: `applyConversationMessages` non gestisce errori dal host — Severità: MEDIA
**File**: `media/dashboard/modules/conversations.js` (righe 223-254), `media/dashboard/modules/main.js` (handler `conversationMessages`)
**Problema**: Se il host invia `error`, il loading spinner non viene rimosso e non c'è messaggio utente.
**Impatto**: Stato UI bloccato dopo fallimento lettura DB (accoppiato a S-2).
**Sistemazione proposta**:
```javascript
} else if (msg.type === "conversationMessages") {
  if (msg.error) {
    applyConversationMessages(msg.conversationId, []);
    // oppure nuova funzione showConversationMessagesError(msg.error)
  } else {
    applyConversationMessages(msg.conversationId, msg.messages);
  }
}
```

---

## Problemi nei test

### T-1: Nessun test per `UsageEventStore` — Severità: MEDIA
**File**: `src/usage-event-store.ts` (manca `test/usage-event-store.spec.ts`)
**Problema**: Dedup, persist, `getEventsSince`, righe corrotte non coperti. Il bug S-1 non verrebbe catturato da CI.
**Impatto**: Regressioni silenziose sull'archivio locale.
**Sistemazione proposta**: Test con tmp dir: insert due eventi con fingerprint diversi ma campi parziali uguali; verificare count; verificare `INSERT OR IGNORE` behavior.

### T-2: Nessun test per propagazione `locale`/`currency` in `postState` — Severità: BASSA
**File**: `src/dashboard-panel.ts` (righe 147-155)
**Problema**: Fix recente per race init/state non ha test di regressione.
**Impatto**: Rischio di ripresentare stringhe inglesi al primo render.

---

## Note di qualità (non bloccanti)

### Q-1: Duplicazione logica sql.js / path WASM
**File**: `src/cursor-state-db.ts`, `src/usage-event-store.ts`
**Suggerimento**: Estrarre `openSqlJs(extensionPath)` condiviso per DRY e un solo punto di fix se cambia packaging wasm.

### Q-2: `DEFAULT_EUR_USD_RATE` duplicato
**File**: `src/dashboard-locale.ts`, `media/dashboard/modules/format.js`
**Suggerimento**: Unica fonte di verità; il bundle dashboard non può importare dal host, ma si può generare/copiare in build o documentare che devono restare sincronizzati.

### Q-3: `formatOnDemandTooltipCell` definita ma mai usata
**File**: `src/extension.ts` (righe ~275-284)
**Suggerimento**: Rimuovere codice morto o usarla nel tooltip markdown.

---

## Cosa funziona bene ✅

- **Sicurezza XSS messaggi chat**: testo da DB Cursor sempre escaped prima di `innerHTML`.
- **Separazione moduli dashboard**: refactor in `modules/` migliora manutenibilità rispetto al monolite precedente.
- **i18n/valuta end-to-end**: `currency-format.ts` unifica host; dashboard con `formatUpdatedAt` e `postState` con locale/currency risolve la race init.
- **Lettura DB Cursor read-only**: `withCursorStateDb` chiude sempre il DB nel `finally`; nessuna scrittura su `state.vscdb`.
- **Test suite**: 104 test passano; buona copertura parsing API, titoli conversazione, aggregazione server-side.
- **Packaging sql.js**: `node_modules/sql.js` incluso nel VSIX con wasm path di fallback sensato.

---

## Prossimi step

Come vuoi procedere?

1. **Applica tutte le correzioni** — applicherò tutte le correzioni proposte
2. **Applica solo i problemi bloccanti** — sistema i problemi CRITICA e ALTA, salta note di qualità
3. **Applica in modo selettivo** — dimmi quali ID applicare (es. "applica S-1, S-2")
4. **Solo il report** — non applicare nulla
5. **Parliamone prima** — discutiamo risultati specifici
