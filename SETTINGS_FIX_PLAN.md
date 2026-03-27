# Settings Page Fix Plan

**Last updated:** 2026-03-26  
**Status:** ✅ All items complete  
**App:** Scribe (https://scribe.eaglepass.io)

---

## P0 — Security ⚠️ Ship nothing until these are done

### P0-1: Manual provider credentials live in browser
**Severity:** Critical  
**Finding:** Audit #3 (High) — marked "Complete" in audit report (was actually already fixed)  
**Status:** ✅ Already fixed — server-side `/api/ai/manual/chat` proxy exists, `agentApiKey` is stripped from all browser-visible state by `normalizeAppSettings()`, no `dangerouslyAllowBrowser` in source

---

## P1 — Core Stability 🔴 Blocks basic usage

### P1-1: No error boundary
**Severity:** High  
**Status:** ✅ Fixed — `ErrorBoundary` component created at `src/components/ErrorBoundary.jsx`, wrapped around SettingsPanel in Layout.jsx, shows user-friendly error state with retry

### P1-2: Org/repo loading can hang forever
**Severity:** High  
**Status:** ✅ Fixed — 10-second timeouts on both org and repo fetches, with graceful fallback to user login on org failure

### P1-3: Form disabled on first open with no explanation
**Severity:** Medium  
**Status:** ✅ Fixed — Loading overlay covers the form when bootstrap is pending, submit button re-enabled (no longer disabled for `loading` since overlay handles it)

---

## P2 — Correctness Bugs 🟡 Works but wrong behavior

### P2-1: `agentApiKeyConfigured` badge desyncs after save
**Severity:** Medium  
**Status:** ✅ Fixed — `showKeyBadge` added, badge condition uses `manualKeyConfigured` (which includes `!clearAgentApiKey`) so it reactively hides when key is marked for removal

### P2-2: Flash of stale/default settings on open
**Severity:** Medium  
**Status:** ✅ Fixed — Full-screen loading overlay appears while bootstrap is pending, covers the form entirely to prevent flash of stale/default values

### P2-3: `handleSyncNow` reports full success on partial failures
**Severity:** Low  
**Status:** ✅ Fixed — `formatSyncStatus()` now detects partial success states (published/cloned/pulled) and returns `warning` tone with "Partial" label; CSS `warning` badge style added

---

## P3 — Polish 🟢 Low urgency

### P3-1: Heartbeat status disconnected from live scheduler state
**Severity:** Low  
**Status:** ✅ Fixed — Scheduler status row added showing "Active" / "Inactive" / "Running..." based on `heartbeatStatus.status` and `form.heartbeatEnabled`

### P3-2: Org fallback skips organizations
**Severity:** Low  
**Status:** ✅ Fixed — `orgFetchFailed` and `repoFetchFailed` state tracked; warning message shown below respective selects when fetch fails (⚠️ style)

### P3-3: No loading state for individual sections
**Severity:** Low  
**Status:** ✅ Fixed — Refresh repository button shows `⟳` spinner prefix when `syncingRepo === true`

---

## Completed Items ✅

All items now complete:
- ✅ P0-1: Server-side chat proxy + key-only-server storage (was already done)
- ✅ P1-1: Error boundary created and wrapped around SettingsPanel
- ✅ P1-2: Org/repo fetches now have 10s timeouts with graceful fallback
- ✅ P1-3: Loading overlay covers form during bootstrap; submit button always accessible
- ✅ P2-1: Key badge reacts to `clearAgentApiKey` toggle in real-time
- ✅ P2-2: Loading overlay prevents flash of stale settings
- ✅ P2-3: Partial sync success detected and shown as "warning/Partial"
- ✅ P3-1: Scheduler status (Active/Inactive/Running) shown in heartbeat section
- ✅ P3-2: Org/repo fetch failure warnings shown below respective selects
- ✅ P3-3: Sync button shows spinner when syncing

---

## Testing Checklist

After each fix, verify:

- [x] Settings panel opens without crash (error boundary in place)
- [x] Settings panel renders correctly while loading bootstrap (loading overlay shown)
- [x] Org dropdown shows loading → result or error with warning → retry (timeout at 10s)
- [x] Repo dropdown shows loading → result or error with warning → retry (timeout at 10s)
- [x] Manual provider API key save + remove works correctly
- [x] Manual provider chat works through server proxy (P0)
- [x] Form values persist correctly after save
- [ ] No console errors in browser during normal usage
- [x] `npm run lint` passes (0 errors, 0 warnings)
- [x] `npm run test` passes (126/126 tests passing)
- [x] `npm run build` passes

---

## Related Files

| File | Role |
|------|------|
| `src/components/Settings/SettingsPanel.jsx` | Main settings panel |
| `src/components/Settings/SettingsSections.jsx` | Section sub-components |
| `src/components/Settings/SettingsPanel.css` | Styles (loading overlay, warning badge) |
| `src/components/ErrorBoundary.jsx` | Error boundary wrapper (new) |
| `src/context/SettingsContext.jsx` | Settings state management |
| `src/context/AuthContext.jsx` | Bootstrap data loading |
| `src/context/ThemeContext.jsx` | Theme state |
| `src/services/storage.js` | Frontend storage service (normalizes settings, strips keys) |
| `server/src/routes/storage-routes.js` | Backend storage API |
| `server/src/routes/ai-routes.js` | `/api/ai/manual/chat` proxy |
| `server/src/services/manual-openai.js` | Manual provider proxy (complete) |

## Audit Reference

Full codebase audit: `codebase-audit-report.html`
