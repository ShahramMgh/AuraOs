# Cellular Layer — SIMCom A7670E (data · voice · SMS · GPS)

AuraOS treats the phone radio the way it treats Wi-Fi: as a **ModemManager**
device. The A7670E (4G LTE Cat-1 with voice + GNSS) is a standard ModemManager
modem, so:

- **Mobile data** → ModemManager + **NetworkManager** (a `gsm` connection), same
  `nmcli` path the shell already uses for Wi-Fi.
- **SMS**, **voice call control**, **GPS** → the agent's bridge (`agent/modem.py`)
  drives **`mmcli`** (ModemManager's CLI). The shell reaches it only through the
  agent at `/api/phone/*`, `/api/sms`, `/api/location` — token-gated like everything.

Nothing here talks raw AT: ModemManager owns the modem's serial ports, so we
don't fight it. It degrades honestly — no modem → `{available:false}` and the
Phone/Messages apps show "No cellular modem" instead of pretending.

```
 shell (Phone/Messages/Maps) ──/api/{phone,sms,location}──► aura-agent ──► modem.py
                                                                            │ mmcli
                                                              ModemManager ◄┘  (system bus)
                                                                    │
                                                            SIMCom A7670E (USB or UART HAT)
   mobile data: ModemManager ─► NetworkManager (gsm connection, APN)
```

## Wiring the A7670E

Two common form factors, both handled by `65-modem.sh`:

- **USB board** (A7670E USB dongle / eval board): plug it in. ModemManager and
  `usb-modeswitch` auto-detect it; it appears as `mmcli -L` modem 0. Nothing else
  to do.
- **UART HAT** (Waveshare-style, on the Pi's 40-pin GPIO serial): the build adds
  `enable_uart=1` + `dtoverlay=disable-bt` to `config.txt` so the PL011 UART is
  free for the modem. Power the HAT (PWRKEY) per its manual.

## The API (agent, token-gated)

| Route | Method | Does |
|---|---|---|
| `/api/phone/status` | GET | present? registered? operator, signal, tech, own number, data state |
| `/api/phone/state` | GET | active/incoming calls `[{number, direction, state}]` |
| `/api/phone/dial` | POST | `{number}` — place a voice call |
| `/api/phone/answer` | POST | accept the ringing call |
| `/api/phone/hangup` | POST | end the active/ringing call |
| `/api/sms` | GET | inbox/sent `[{number, text, time, sent, unread}]` |
| `/api/sms/send` | POST | `{number, text}` — send an SMS |
| `/api/location` | GET | GNSS fix `{lat, lon, alt}` (or "no fix yet") |

The **Phone** app is a real dialer with an in-call/incoming-call UI; **Messages**
is real SMS (list + send, polled for new); **Location** (GPS) can feed the
location sensor and Maps. In the browser preview (SIM mode) a registered modem is
modelled so both apps are fully explorable offline.

## Mobile data

If you pass an APN at build time it's pre-provisioned:

```
sudo AURA_APN=internet AURA_APN_USER= AURA_APN_PASS= bash build.sh
```

Otherwise set it once on device (carrier-specific APN):

```
nmcli c add type gsm ifname '*' con-name aura-mobile apn <YOUR_APN>
```

## Voice audio — the honest caveat

`mmcli` establishes, answers and ends the **call**. Whether you can **hear and
speak** depends on the A7670E's **audio path**: its PCM digital audio or analog
mic/speaker lines must be wired to a codec (or the board's onboard codec) and
routed by ALSA. That's board wiring + an ALSA profile, not something software can
conjure. On boards without audio wired, calls connect but carry no audio. SMS,
GPS and data are unaffected.

Also note: ModemManager's **voice** interface must be available for your MM
version + the SIMCom plugin. If it isn't, `/api/phone/dial` returns
`"voice not supported by this modem/ModemManager"` — honestly — and SMS/GPS/data
still work.

## Verified vs. not-yet-verified

| Claim | Status |
|---|---|
| Agent imports `modem.py`; `/api/phone/*`, `/api/sms`, `/api/location` route, auth-gate, and degrade gracefully when no modem is present | **Verified** — real agent, this session |
| SMS/voice/GPS drive real ModemManager (`mmcli`) on an A7670E; data connects via NetworkManager | **Not yet verified** — needs the A7670E on real hardware (Tier 3) |
| Voice call audio is audible | **Not yet verified** — depends on the board's audio wiring |

## Files

```
65-modem.sh              build step: ModemManager + NM + usb-modeswitch/ppp,
                         /etc/aura/modem.env, optional APN, UART enable for HATs
agent/modem.py           the mmcli bridge (status, SMS, voice, GNSS); never raises
agent/aura-agent.py      /api/phone/*, /api/sms, /api/location routes
shell/js/api.js          Sov.phone / Sov.sms / Sov.location (+ SIM modem)
shell/js/shell.js        real Phone dialer + in-call UI; real Messages (SMS)
```
