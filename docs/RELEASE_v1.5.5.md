# v1.5.5

- Register the Colyseus `party:member` listener when each room object is created, before the join handshake can deliver its first membership event.
- Calculate connected party count from the authoritative room state and show `Exploring alone` while a one-person party explores.
- Keep a spinner and “Closing party connection…” status visible until leaving finishes and solo controls unlock.
- Explain that the server's first startup may take up to about a minute while the existing elapsed-time progress continues.
- This release has not had a new live browser play-through yet. The v1.5.4 server integration results remain the previous baseline.
