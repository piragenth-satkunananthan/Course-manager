# The NVIDIA NIM key may be saved in the database, encrypted

**Status:** accepted by the product owner on 2026-11-26 (decision U45, ticket #81).

Until now every secret lived in the server's root-only `.env` file (ADR-0001 and design §12), and changing the NVIDIA NIM key meant an SSH session. The product owner wants to change the key and the model from Settings. So the Student may save their own key in the database, and the model they choose.

## Decision

- The key is stored in `user.nim_api_key_enc`, **encrypted with the data key** (AES-256-GCM, the same `DATA_ENCRYPTION_KEY` that already encrypts the WhatsApp keys and message text). The data key stays off the database, in the `.env` file, with the product owner's offline copy.
- The key is **checked with NVIDIA before it's saved** (the model list must accept it); a refused key isn't saved.
- The key **never leaves the server**: no response, page, log, export or error contains it. The page shows only `••••last4`. Tests check that a saved key never appears in a response or in the stored bytes.
- The server's key in `.env` stays as the **fallback**. "Use the server's key" removes the saved one.
- Every NIM call (the worker's AI loop on each tick, "Test AI now") reads the key and model fresh, so a change applies without a restart.
- The model is a plain setting (`user.nim_model`), with the previous one kept for "Switch back". The AI test set was passed on the server's model; the page warns that another model may read messages differently and runs "Test AI now" on the new one.

## Considered options

- **Keep the key only in `.env`** (today): safest, but every change needs SSH. Rejected by the product owner.
- **Store the key in plain text:** a database backup would then expose it. Rejected.

## Consequences

- A copy of the database alone can't reveal the key; the database plus the data key can, as already for the WhatsApp keys.
- The web container needs the NIM settings (for "Test AI now", #80) and already has the data key (it shows message text).
- Deleting the account deletes the saved key with the user row.
