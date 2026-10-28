# GameDistribution HTML5 SDK

Game ID: `b2296dcb8238480f993960aabfb2bbb4`. The official CDN SDK loads on GameDistribution hosts or self-hosted iframe URLs carrying GD_SDK_REFERRER_URL (uppercase/lowercase supported). Explicit registered-domain tests may use ?gdPreview=1. Ordinary Sites, file:// and CrazyGames do not load this SDK. Browser QA found that GameDistribution redirects the unregistered Sites domain to its blocked page, so standalone Sites must not initialize it. Advertising domain eligibility remains controlled by GameDistribution.

Start, confirmed New Journey, Continue and party expedition actions wait for SDK_READY and the interstitial outcome. Pause requests an interstitial at a natural break. Concurrent clicks share one request and one continuation. SDK loading failure, timeout, no-fill and rejected ad requests release simulation and audio. Late SDK_READY events remain usable. The SDK controls actual ad eligibility/frequency; only concurrent requests are deduplicated. Title controls wait up to 8 seconds for SDK preparation. Requests that never start time out after 12 seconds; this timeout is cancelled when the video starts.

`?gdDebug=1` enables SDK event logging. Adapter diagnostics: `DrifterGameDistribution.state`, `.lastError`, `.lastAdResult`. These are diagnostics, not proof of a displayed advertisement.

Publishers must test the uploaded ZIP through the GameDistribution developer-panel iframe and fully view an advertisement without skipping. Local mock verification cannot establish inventory fill or portal approval.

## Night hordes
Solo nights open with 12 creatures and replenish 12 every 2 seconds, up to 120 living night creatures. Distant creatures are reclaimed, all three night species respect campfire protection and Duskward, and dawn clears them. Authoritative party spawning is controlled by the separate Colyseus server.
