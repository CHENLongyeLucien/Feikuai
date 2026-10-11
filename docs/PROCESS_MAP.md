# Interactive process map

Open **Campus** in the navigation.

1. Leave **Follow an item** on **Explore the process** to see the complete route, or choose an invoice, email, voice message or text item.
2. Select a numbered station to read its recorded result. **Previous** and **Next** move through the stages.
3. Use **Focus station** for a closer look, or drag and zoom. **Fit map** restores the complete route. **2D / 3D** changes the view.
4. Use **Open review** to inspect the original record and take any available review action there.

The six stations cover arrival, security, financial checks, the decision and final audit, payment, and the saved report. A source can have a report while its payment remains unconfirmed. A security hold stops advancement; old or missing checks are not assumed to have passed. An existing payment on a linked invoice never grants another source permission to proceed.

The map rearranges into two columns on narrow screens. If 3D is unavailable, the same six stages remain available as buttons. Pause and reduced-motion settings affect visuals only. When reduced motion is enabled in Settings, the map explains that preference and disables its resume control. Escape closes stage details and returns keyboard focus to that stage. Selected inbox items remain available even after moving outside the latest-100 list; a failed refresh preserves the last recorded state with a retry message.

## Validation

The browser suite reads a copied demonstration database with workers and seeding disabled. It allows only local demo login writes, blocks other application writes and never creates financial fixtures. It covers Chrome, Firefox and WebKit at 1440×1000, 1024×900, 390×844 and 320×740. It requires existing source reviews and verified settlement records. Launch a separate copied preview before running:

```sh
SF_PROCESS_WEB_URL=http://127.0.0.1:5283 pnpm exec playwright test --config tests/e2e/process-map.config.ts
```

Raw results, screenshots and traces stay in ignored `var/process-map-qa/`. Actual completed test counts and any failed attempts are recorded in [BUILD_STATUS.md](BUILD_STATUS.md). This UI work does not rerun chain integration tests or establish physical mobile-device performance.
