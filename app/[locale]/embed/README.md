## Deltalytix Embed

Embed an interactive analytics dashboard (or a single chart) into any site using a simple iframe. You can also live-feed data via postMessage.

### Quick start

```html
<iframe
  id="deltalytix-embed"
  src="https://trades.thekavin.com/embed?theme=dark"
  width="100%"
  height="900"
  style="border:0;"
  loading="lazy"
  allow="fullscreen"
  title="Deltalytix Dashboard"
></iframe>
```

### Query parameters
- `theme` (optional): `dark` | `light` | `system` (default: `dark`)
- `preset` (optional): `light` | `dark` | `ocean` | `sunset`
- `lang` (optional): `en` | `fr` (default: `en`) - Language for chart labels and tooltips
- `charts` (optional): comma-separated list of chart keys to render
  - If `charts` is not provided, all charts are shown
- `overrides` (via individual keys below). Accepts HSL components, HEX, rgb(a), or hsl(a). Values are normalized to Tailwind-compatible HSL components under the hood.
  - `background`, `foreground`, `card`, `popover`, `muted`, `mutedFg`, `border`, `input`, `ring`
  - `radius` (CSS length, e.g. `0.75rem`)
  - `chart1`..`chart8` (chart palette slots)
  - `success`, `successFg`, `destructive`, `destructiveFg`
  - `tooltipBg`, `tooltipBorder`, `tooltipRadius`

Examples:

```html
<!-- Single chart with French language -->
<iframe src="https://trades.thekavin.com/embed?charts=pnl-per-contract-daily&lang=fr" ...></iframe>

<!-- Multiple charts with English language (default) -->
<iframe src="https://trades.thekavin.com/embed?charts=time-range-performance,daily-pnl,pnl-by-side&lang=en" ...></iframe>

<!-- Preset with palette tweaks (HEX, RGB, HSL all accepted) -->
<iframe src="https://trades.thekavin.com/embed?theme=dark&preset=ocean&chart1=%233b82f6&border=rgba(229,231,235,1)&tooltipBg=0%200%200%20/%200.8" ...></iframe>
```

### Available chart keys
- `time-range-performance`
- `daily-pnl`
- `time-of-day`
- `time-in-position`
- `pnl-by-side`
- `trade-distribution`
- `weekday-pnl`
- `pnl-per-contract`
- `pnl-per-contract-daily`
- `tick-distribution`
- `commissions-pnl`
- `contract-quantity`

### Data schema
You can push your own trades into the embed. A trade object can include:

```ts
type Trade = {
  pnl: number
  entryDate?: string | Date // ISO string preferred
  side?: 'long' | 'short' | string
  timeInPosition?: number // seconds
  quantity?: number
  commission?: number
  instrument?: string // e.g. ES, NQ, CL
}
```

### PostMessage API
Target the iframe and post structured messages. Origin can be restricted to `https://trades.thekavin.com` for production.

```html
<iframe id="deltalytix-embed" src="https://trades.thekavin.com/embed" ...></iframe>
<script>
  const iframe = document.getElementById('deltalytix-embed')

  // 1) Add specific trades
  iframe.contentWindow.postMessage({
    type: 'ADD_TRADES',
    trades: [
      {
        pnl: 125.4,
        timeInPosition: 240,
        entryDate: '2025-01-10T14:25:00Z',
        side: 'long',
        quantity: 2,
        commission: 4.5,
        instrument: 'ES'
      }
    ]
  }, 'https://trades.thekavin.com')

  // 2) Generate N random trades (useful for demos)
  iframe.contentWindow.postMessage({ type: 'ADD_TRADES', count: 25 }, 'https://trades.thekavin.com')

  // 3) Reset back to initial demo data
  iframe.contentWindow.postMessage({ type: 'RESET_TRADES' }, 'https://trades.thekavin.com')

  // 4) Clear all trades
  iframe.contentWindow.postMessage({ type: 'CLEAR_TRADES' }, 'https://trades.thekavin.com')

  // 5) Add Phoenix orders (they will be parsed and processed FIFO into trades)
  //    Provide the raw orders array from your Phoenix export
  iframe.contentWindow.postMessage({ type: 'ADD_PHOENIX_ORDERS', orders: [/* ... */] }, 'https://trades.thekavin.com')
</script>
```

Notes:
- Messages are JSON-serializable objects with a `type` field.
- For local testing or permissive setups you can use `'*'` as the target origin instead of `https://trades.thekavin.com`.

### Theming
Choose a theme via the `theme` query parameter. Example:

```html
<iframe src="https://trades.thekavin.com/embed?theme=light" ...></iframe>
```

### Sizing and layout
- The embed is responsive; set `width="100%"` and a fixed `height` that suits your layout.
- All charts are placed in a responsive grid.

### Troubleshooting
- Nothing renders: ensure the iframe `src` is reachable and no adblocker is interfering.
- No data after posting: check that the message `type` matches one of the supported values and that you target the correct iframe/origin.