# Wireshark — HPO Packet Padding Test

## Terminal 1 — Start the server
```cmd
npm run dev
```

## Terminal 2 — Launch Chrome with TLS key logging
```cmd
taskkill /F /IM chrome.exe
set SSLKEYLOGFILE=C:\Users\Nathan\tls-keys.log
start chrome.exe https://localhost:3000
```

## Wireshark setup
1. **Edit → Preferences → Protocols → TLS**
2. Set **(Pre)-Master-Secret log filename** to `C:\Users\Nathan\tls-keys.log`
3. Click **OK**
4. Select **Adapter for loopback traffic capture** and start capture
5. Filter: `tcp.port == 3000`

## Capture
- Log in and open a chat conversation in Chrome
- Change filter to: `websocket`

## Expected result
All packets should be **1492 bytes** arriving every **~500 ms** — same size and rate
whether you are sending messages or idle. This confirms HPO padding is working.
