# Security Specification & Test Matrix

## Data Invariants
1. **Building Isolation**: Every record must map to a valid building identifier or root association schema.
2. **Identity & Ownership**: Resident account mutations must never overwrite identities without authorization.
3. **Financial Integrity**: Payment amounts and expense figures must be positive numeric values (`amount > 0`).
4. **Denial-of-Wallet Resistance**: All text fields must have finite bounded lengths (messages <= 2000 chars, titles <= 300 chars, ids <= 128 chars).
5. **No Blind Blanket Reads**: Sensitive administrative configurations and private credentials must not be scrapable by arbitrary unauthenticated bots.

## The Dirty Dozen Payloads (Red Team Test Matrix)
1. **Payload 1 (Ghost Field Injection)**: `{ "id": "res_1", "name": "Fake Resident", "isAdmin": true }` -> REJECT (Privilege escalation guard).
2. **Payload 2 (Mega-String Buffer Overflow)**: `{ "id": "msg_1", "text": "A".repeat(50000) }` -> REJECT (Size limit > 2000).
3. **Payload 3 (Negative Payment Value)**: `{ "id": "pay_1", "amount": -500 }` -> REJECT (Amount must be > 0).
4. **Payload 4 (Zero-Length ID Poisoning)**: `{ "id": "" }` -> REJECT (Empty ID path).
5. **Payload 5 (Path Traversal ID)**: Document ID `../../secret` -> REJECT (Regex check `^[a-zA-Z0-9_\\-\\.:]+$`).
6. **Payload 6 (Admin Decision Spoofing)**: Non-admin trying to write to `/admin_decisions` without admin privileges -> REJECT.
7. **Payload 7 (Config Overwrite Attack)**: Anonymous user attempting to wipe `/config/default` -> REJECT.
8. **Payload 8 (Chat Message Null Sender)**: `{ "id": "msg_2", "text": "hello", "senderName": "" }` -> REJECT (Required fields check).
9. **Payload 9 (Expense Negative Amount)**: `{ "id": "exp_1", "amount": -1000 }` -> REJECT (Amount must be positive).
10. **Payload 10 (Join Request Status Bypass)**: Non-admin trying to set Join Request status to `APPROVED` -> REJECT.
11. **Payload 11 (Unauthenticated Admin Collection Access)**: Unauthenticated user writing directly to `/admins/admin_hack` -> REJECT.
12. **Payload 12 (Oversized Base64 Payload in Document)**: Document with 2MB base64 string exceeding Firestore 1MB doc ceiling -> REJECT.
