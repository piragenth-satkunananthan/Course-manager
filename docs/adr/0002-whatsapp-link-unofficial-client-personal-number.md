# WhatsApp Link uses an unofficial client on the Student's personal number

Class information arrives almost entirely through WhatsApp Course Groups and the Class Group, and WhatsApp's official Business API cannot read groups a personal account belongs to. So the WhatsApp Link runs Baileys, an unofficial WhatsApp Web client, linked to the Student's **personal** number. The product owner accepted that WhatsApp may ban numbers that use unofficial clients. Do not "fix" this by moving to the official API or a spare number without asking.

## Considered Options

- **Uploading WhatsApp's chat exports by hand**: rejected. It's safe but manual, and the product owner wants changes to show up without doing anything.
- **A spare number added to the groups**: rejected by the product owner for now.

## Consequences

- The link can see every chat on the number. Only explicitly linked groups are processed; every other message is dropped on arrival and is never stored or sent to the AI.
- The link only reads: it sends no messages, read receipts or presence, to keep the ban risk as low as possible. The protocol itself still sends delivery receipts and key uploads.
- Baileys runs with `markOnlineOnConnect: false`, so the phone keeps its notifications (Baileys' README; checked in M0), and with `shouldIgnoreJid`, which drops every chat that isn't a linked group inside Baileys, before decryption (decision U10).
- History sync is disabled (`syncFullHistory: false`, `shouldSyncHistoryMessage: () => false`): there is no look-back, and messages sent before a group was linked are never read.
- WhatsApp drops linked devices after about 14 days if the phone stays offline. The dashboard shows a reconnect banner.
