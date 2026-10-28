# v1.5.3

- GameDistribution initialises on ordinary HTTPS game hosts before title controls unlock (8-second offline fallback). The official SDK owns ad frequency.
- New/Continue wait for the ad to finish. Requests are deduplicated; load failures, no-fill, throws and missing callbacks recover without locking gameplay. Active videos are never cut off by the request timeout.
- Solo night hordes: up to 12 spawns every 2 seconds; 120 live night creatures globally. Kills refill throughout the night, distant creatures are culled, all night creatures vanish at dawn. Campfire protection applies to all three night species.
- The external Colyseus service is unchanged; party worlds continue using their server-owned spawning.
- Real ad completion/SDK activation must be verified in the GameDistribution upload-panel iframe after uploading the ZIP.
