# PixLite A4 Connectivity — Diagnosis & Fix Report

**Date:** 2026-07-12
**Author:** on-site diagnostic session (drummer's PC, on the LED LAN)
**Audience:** an agent working from the repo on a dev PC **with no controller access** — everything needed to implement the fixes cold is below.

---

## 0. TL;DR

The app "discovered the controller but kept losing the connection," and separately "sent no pixel data." These were **two independent problems on the two independent planes**, plus several latent code defects that made both invisible/unrecoverable.

- **Connection drops (management plane):** the app **hardcodes PixLite API version `v1.7`**, but the controller ran firmware **3.5.0**, which only speaks API **v1.0/v1.5**. Every authenticated poll returned **HTTP 400**, and the monitor flips to LOST on a *single* failed poll. So it was a **deterministic 100% failure**, not an intermittent one.
- **No pixel data (data plane):** output was stuck in `state: "disabled"`, and **there is no UI control anywhere that arms the output** — the whole `disabled → dry-run → armed` machine is wired end-to-end *except* the button.

**Already done on the drummer's PC (see §4):** controller firmware updated to **3.14.2** (now speaks up to v1.9), and the persisted project's `output.state` was flipped to `armed`. **Pixel data is now confirmed flowing** (controller `inGood` climbing across 16 universes, `inBadSeq: 0`). These two are *machine-local workarounds*; the code fixes below are what make it correct and reproducible on any machine/firmware.

---

## 1. Environment (as observed)

| Thing | Value |
|---|---|
| Controller | Advatek **PixLite A4-S Mk3**, nickname "Tims spaceship" |
| Controller IP | `192.168.0.50` (unicast), MAC `e0:b6:f5:e0:a9:ab` (Advatek OUI) |
| Firmware | **was 3.5.0 → now 3.14.2** |
| API advertised (`/ver`) | was `v1.{0,5}` → now `v1.{0,9}` |
| Auth | `authReqd: false` (empty password → `EMPTY_PASSWORD_AUTH` hash) |
| PC NIC | `en9`, `192.168.0.2`, netmask **255.255.0.0 (/16)**, 1000baseT full-duplex |
| Kit | Kick 196, Snare 108, Tom1 108, Tom2 136 = **548 px ≈ 1644 ch ≈ 4 universes** |
| App | packaged desktop build **v0.2.8** (`/Applications/LEDrums.app`), server on :58400 |
| Live output settings | `artnet` → `192.168.0.50:6454`, iface `192.168.0.2`, broadcast `true`, fps `120`, RGB |

Ping to `.50` was 0% loss / ~0.4 ms throughout. **The link/L2/L3 layers were never the problem** — this rules out every "network drop" hypothesis (cable, power-save NIC, IP conflict, DHCP drift, brown-out): the controller's own health is nominal (§5).

---

## 2. Problems found

Severity: **P1** blocks core function · **P2** correctness/robustness · **P3** quality/foot-gun.

### P1 — Management API version is hardcoded to `v1.7` (ROOT CAUSE of the connection drops)
- **Symptom:** discovery/adopt succeed, then controller status immediately flips to LOST; no commands land.
- **Root cause:** `HttpPixliteClient` defaults `apiVersion` to `'v1.7'` and builds every management URL as `/{apiVersion}/`. Nothing in the server overrides it. When the controller doesn't implement v1.7, `POST /v1.7/?…` returns **HTTP 400**, `post()` throws on non-200, and the poll fails — forever.
- **Why it looked like "discovers but drops":** discovery/adopt use unauthenticated `GET /ver` (no version segment) → works. Only the authenticated poll carries `/v1.7/` → always 400.
- **Evidence (same controller, back-to-back):**
  - `GET /ver` → 200, advertised `apiVer v1.{0,5}` on fw 3.5.0.
  - `POST /v1.7/ statisticRead` → **HTTP 400** (~2 ms, empty body).
  - `POST /v1.5/ statisticRead` → **HTTP 200**, full valid `{"resp":"statisticRead",…}`.
  - `POST /v1.0/` → 200; `/v1.6/`, `/v1/` → 400.
  - After firmware → 3.14.2 (`apiVer v1.{0,9}`): `POST /v1.7/` → **HTTP 200**.
- **Key insight:** the app **already parses the controller's advertised `apiVer`** into `ControllerIdentity.apiVer` but **never uses it** to choose the request path.
- **Locations:**
  - `packages/io/src/pixlite/client.ts:140` — `this.apiVersion = opts.apiVersion ?? 'v1.7';`
  - `packages/io/src/pixlite/client.ts:187-192` — `mgmtUrl()` builds `/${this.apiVersion}/`.
  - `packages/io/src/pixlite/client.ts:201` — `if (res.status !== 200) throw …` (turns 400 into a poll failure).
  - `packages/io/src/pixlite/protocol.ts:97-114` — `parseVersionResponse` already extracts `apiVer` (unused for path selection).
  - `apps/server/src/main.ts` (controller-monitor wiring) + adopt flow — where the client is constructed; no `apiVersion` passed.

### P2 — A single failed poll = instant LOST (no grace/retry window)
- **Root cause:** `pollOnce` sets `reachable = false` on *any* thrown error/timeout once stats have ever succeeded — no debounce, no N-consecutive-failure tolerance.
- **Impact:** one 2 s timeout (controller briefly busy, one dropped UDP datagram, a GC pause) instantly shows LOST and freezes `lastSeen`. This is what amplified P1 into "flapping," and will make any *future* transient look like a hard disconnect.
- **Location:** `apps/server/src/controller-monitor.ts:254-288` (`pollOnce`), specifically the `catch` at `:272-284` and `reachable = !statsEverSucceeded && identity !== null && lastSeen !== null` at `:275`.

### P3 — There is no UI control to arm the output (why zero pixel data)
- **Root cause:** the output state machine `disabled → dry-run → armed` is fully plumbed **except the affordance that sends `state`**:
  - `OutputPartial.state` exists — `apps/web/src/lib/trigger-lab/store/trigger-routing.ts:31`.
  - WS `setOutput` schema accepts `state`; server applies it — `apps/server/src/input-router.ts:190-202` → `engine.setOutput` → `OutputManager.applySettings` (`apps/server/src/output-manager.ts:93-117`).
  - The pill renders ARMED/LIVE/DRY correctly — `apps/web/src/lib/app/chrome/output-pill.ts`.
  - **But no component ever calls `store.setOutput({ state })`.** The transport inspector (`apps/web/src/lib/app/docks/inspectors/PatchControllerInspector.svelte`) edits host/port/iface/broadcast/protocol/fps/rgb/priority — **no arm control**. A mockup toggle (`onLabel:"armed"/offLabel:"safe"`, aria `"Arm output"`) exists **only in the styleguide bundle**, never wired in.
- **Impact:** every project sits at the `disabled` default (§P5) and can never transmit; the boot banner literally says "Arm in the UI" but there is no such control.

### P4 — Output socket/send errors are silently swallowed
- **Root cause:** `ArtNetOutput` discards errors: `this.socket.on('error', () => {})` (`packages/io/src/artnet.ts:49`) and the send callback `this.socket.send(pkt, port, host, () => {})` (`:74`). `OutputManager.sendFrame`'s try/catch only catches *synchronous* throws; `dgram` delivers send failures **asynchronously** to that callback, so they never reach `OutputManager.lastError`.
- **Impact:** a misconfigured target (e.g. limited-broadcast `255.255.255.255` with `broadcast:false` → `EACCES`) shows the pill as **ARMED** while **nothing leaves the NIC** and the fault row stays empty — undiagnosable from the UI. (This is exactly the trap the stale default in §P5 sets.)
- **Locations:** `packages/io/src/artnet.ts:49, 71-75`; surface point `apps/server/src/output-manager.ts:143-170`. Check `SacnOutput` for the same pattern.

### P5 — Foot-gun defaults: `disabled` + `255.255.255.255` + `broadcast:false`
- **Root cause:** `packages/core/src/model/defaults.ts:176` ships `output: { state:'disabled', host:'255.255.255.255', broadcast:false, fps:44 }`.
- **Impact:** a fresh project **cannot output** (state disabled, no UI to change it — P3) and, if armed, the broadcast address with `broadcast:false` fails **silently** (P4). Three defects compound into "armed, green, and dead."
- **Note:** the drummer's *live* project was fine (`192.168.0.50` unicast). This bites new/blank projects.

### P6 — Output frame rate too high → controller overruns & drops frames
- **Evidence (live `statisticRead`):** `inFrmRate: 120`, `outFrmRate: 104`, **`overrun: 18285`, `overrunDrop: 3835`**. The app pushes 120 fps; the controller outputs ~104 fps and is **dropping ~3,800 frames** into overrun.
- **Impact:** wasted UDP/CPU, dropped frames, and (pre-firmware-fix) extra load on the controller's shared HTTP/UDP stack — the kind of pressure that makes P2's no-grace design bite.
- **Fix scope:** the live project is at `fps:120`; repo default is 44. Recommend 44–60 and a UI cap/warning.

### P7 — (Verify) Universe span is 2–17 (16 universes) vs ~4 expected
- **Evidence:** controller receives Art-Net universes **2–17** (note: starts at **2**, not 0/1), all with healthy `inGood` and `inBadSeq: 0`. The kit only needs ~4 universes (1644 channels).
- **Assessment:** reception is clean, so this isn't breaking anything, but **16 universes for a 4-universe kit** suggests the DMX map / patch is either intentionally spread across data lines or is over-allocating / using an unexpected `startUniverse` offset. Worth confirming the patch matches the A4's actual pixel-port → universe mapping.
- **Locations to check:** `packages/core/src/geometry/dmx-map.ts:58, 87` (`startUniverse` handling) and the project's `kit.outputs` patch.

---

## 3. Recommended fixes

### F1 — Negotiate the API version from `/ver` (fixes P1 permanently) — **highest priority**
Stop hardcoding `v1.7`. Choose the request path from the controller's advertised `apiVer`.

1. Add a pure helper (e.g. in `packages/io/src/pixlite/protocol.ts` or `auth.ts`):
   ```ts
   // Highest minor the app knows how to speak.
   const APP_MAX = { maj: 'v1', min: 7 };
   /** Pick the request-path version segment from a controller's advertised apiVer.
    *  Highest supported minor ≤ APP_MAX for the matching major; fallback 'v1.5'. */
   export function pickApiVersion(apiVer: ApiVersion[]): string {
     const v1 = apiVer.find((a) => a.maj === 'v1');
     if (!v1 || !v1.min.length) return 'v1.5';
     const usable = v1.min.filter((m) => m <= APP_MAX.min);
     const min = (usable.length ? usable : v1.min).reduce((a, b) => Math.max(a, b));
     return `v1.${min}`;
   }
   ```
2. Thread it into the client: the adopt/hydrate path already has the `/ver` identity — pass `apiVersion: pickApiVersion(identity.apiVer)` into `new HttpPixliteClient({…})`. Keep the constructor option; **change the *fallback* default from `'v1.7'` to `'v1.5'`** (client.ts:140) so an un-negotiated client still talks to old firmware.
3. Optional resilience: if a `post()` gets a 400/404, re-`probe()` and re-pick the version once before declaring failure.
4. **Tests** (`packages/io/src/pixlite/*.test.ts`, no hardware): `pickApiVersion([{maj:'v1',min:[0,5]}]) === 'v1.5'`; `[{maj:'v1',min:[0,9]}] === 'v1.7'` (capped at APP_MAX); `[] === 'v1.5'`; and a `client.test.ts` case asserting the mgmt URL uses the negotiated segment. The `fake.ts` client can emit a chosen `apiVer`.

### F2 — Add a failure-grace window to the monitor (fixes P2)
In `controller-monitor.ts` `pollOnce`, don't flip to LOST on the first failure. Track `consecutiveFailures`; keep `reachable` true (showing last-known stats, with a subtle "stale" hint) until it crosses a threshold **or** `now() - lastSeen` exceeds a max age.
```ts
// on success: consecutiveFailures = 0
// in catch:
consecutiveFailures++;
const aged = lastSeen !== null && now() - lastSeen > MAX_STALE_MS; // e.g. 5000
reachable = statsEverSucceeded && identity !== null && consecutiveFailures < LOST_AFTER && !aged; // e.g. LOST_AFTER = 3
```
With a 1.5 s poll, `LOST_AFTER = 3` tolerates ~4.5 s of blips before declaring LOST. Add deterministic tests using the injectable clock/scheduler already present.

### F3 — Wire the Arm control into the UI (fixes P3)
In `PatchControllerInspector.svelte`, add a prominent control at the top of the output section:
```svelte
<Field layout="row" label="Output">
  <SegmentedControl
    value={out.state}
    options={[
      { value: 'disabled', label: 'Disabled' },
      { value: 'dry-run', label: 'Dry-run' },
      { value: 'armed', label: 'Armed' },
    ]}
    disabled={!project || !store.canEdit}
    onChange={(v) => store.setOutput({ state: v as OutputState })}
    ariaLabel="Output arming state"
  />
</Field>
```
- Everything downstream already works (`OutputPartial.state`, WS, server, `OutputManager`). No server changes needed.
- Consider a confirm-step when moving **to `armed`** (it energizes the physical rig), and make the pill's ARMED/LIVE state the visual anchor.
- Once shipped, the boot banner's "Arm in the UI" (`apps/server/src/boot.ts`) is finally true.

### F4 — Surface output transport errors (fixes P4)
Give `ArtNetOutput`/`SacnOutput` an `onError?: (err: Error) => void` seam (or emit on an EventEmitter). Wire socket `'error'` and the `send` callback's `err` to it; in `OutputManager`, set `lastError` and emit a monitor error so the `OutputStatusPanel` fault row shows it. Then a bad target reads as a red fault, not a silent green lie.
- `packages/io/src/artnet.ts:49, 71-75`; `apps/server/src/output-manager.ts:143-170, 201-210` (`status()` already returns `lastError`).

### F5 — Safer output defaults + validation (fixes P5)
- In `defaults.ts:176`, prefer a **unicast placeholder** (empty host that forces selection) or set `broadcast:true` whenever the host is a broadcast address.
- In the server's `setOutput`/`applySettings`, **validate host vs broadcast**: `255.255.255.255` or a directed-broadcast (`*.255`) requires `broadcast:true`; reject/auto-correct otherwise with a surfaced warning. This closes the silent-EACCES trap even if F4 lands.

### F6 — Sane frame-rate default/cap (fixes P6)
- Lower the drummer's project `fps` from 120 to **44–60** (the A4 outputs ~104 fps max here; >~60 buys nothing and overruns).
- In the FPS field (`PatchControllerInspector.svelte`), warn when `fps` exceeds a threshold, and consider clamping the default. Optionally read the controller's `outFrmRate`/`overrunDrop` from stats and surface an "overrunning — reduce FPS" hint.

### F7 — Verify the patch/universe mapping (P7)
Confirm the kit patch → A4 pixel-port/universe map is intentional. If 16 universes is wrong, fix the patch/`startUniverse` so the 548-pixel kit maps to its ~4 universes; if intentional (per-data-line spread), document it. No code change may be needed — this is a verification task. Reproduce with the app + controller, or unit-test `buildDmxMap` against the kit fixture.

---

## 4. What was already changed on the drummer's PC (do NOT assume these exist on the dev PC)

These are **machine-local workarounds**, not committed code. The dev PC has none of them; the fixes in §3 are still required.

1. **Controller firmware 3.5.0 → 3.14.2** (done by the user via Advatek tooling). This is why `v1.7` now works and is the *only* reason the current app build connects. **Do not rely on all controllers being updated** — F1 is still needed.
2. **`output.state` flipped `disabled → armed`** by editing the packaged app's persisted project:
   `~/Library/Application Support/app.ledrums.desktop/projects/default.local.json` (backup: `…/default.local.json.bak-1783862661`). This is userData on *this* Mac only; it does not travel with the repo. F3 replaces this hack with a real control.
3. Host/iface/port in that live project were already correct (`192.168.0.50` / `192.168.0.2` / `6454`, broadcast `true`).

**Confirmed working after the above:** `inGood` climbed 47,685 → 54,519 (+6,834 in 4 s) across **16 universes**, `timedOut` all `false`, `inBadSeq: 0`, `diag.err` empty. Pixel data is flowing.

---

## 5. Controller health baseline (reference — all nominal)

From a successful `statisticRead` while armed:

| Metric | Value | Read |
|---|---|---|
| Temp | 33 °C (min 32 / max 33) | fine |
| Bank voltage | 11,891 mV ≈ **11.9 V** | healthy, no brown-out |
| Port currents | [1200, 1200, 900, 1100] mA | fuses all `good` |
| Art-Net rx | universes 2–17, `inGood` ~18.4k each, `inBadSeq: 0`, `timedOut: false` | clean reception |
| Frame rates | in 120 / out 104 fps | **overrun 18285, overrunDrop 3835** → see P6 |
| `diag` | `errCnt: 0, err: ""` | clean |

This confirms the hardware, power, cabling, and link were **never** implicated — every failure was in the app's software (version negotiation, no-grace monitor, missing arm control, swallowed errors) plus one operational setting (fps).

---

## 6. Suggested implementation order (all doable without a controller)

1. **F1** (version negotiation) + tests — restores connectivity on any firmware. *Highest value.*
2. **F3** (arm control) — makes output reachable from the UI at all.
3. **F4** (surface transport errors) — so misconfig is visible, not silent.
4. **F2** (monitor grace window) — stops transient blips reading as hard LOST.
5. **F5** (safer defaults/validation) + **F6** (fps default/cap).
6. **F7** (verify universe mapping) — needs the rig or a kit fixture test.

Every fix except F7 is unit-testable headless. Gate the branch on `pnpm typecheck` + `pnpm test`, and follow the repo's GROW step (update `.mex/` per `CLAUDE.md`).

### Wire-protocol quick reference (for reproducing without the app)
```bash
# Identity (unauthenticated, no version segment)
curl -s -m 2 http://<IP>/ver

# Authed poll — EMPTY-password auth hash is the well-known constant below.
# Member order req→id→params matters; controller closes the TCP conn per response.
curl -s -m 2 -H "Content-Type: application/json" \
  -d '{"req":"statisticRead","id":1,"params":{"path":[""]}}' \
  "http://<IP>/<apiVer>/?user=admin&auth=47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU"
# <apiVer> must be one the controller advertises in /ver's result.apiVer (e.g. v1.5, v1.7).
```
