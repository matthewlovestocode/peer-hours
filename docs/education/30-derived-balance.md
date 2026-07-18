# Lesson 30: Why Balance Is Derived Instead of Stored

Peer Hours treats balance as the result of valid transfers, not a mutable number that one server owns. Any peer with the same valid history can calculate the same answer.

```mermaid
flowchart LR
  H["Verified transfer history"] --> F["Filter accepted settlements"]
  F --> P["Create equal-and-opposite postings"]
  P --> B["Sum postings by member"]
  B --> V["Local balance view"]
```

## What you already know

A central database might update a row like this:

```sql
UPDATE balances SET minutes = minutes + 60 WHERE member_id = 'alex';
```

That row is convenient, but it requires trust in the system that writes it. A derived balance keeps the supporting facts inspectable.

```ts
const balances = deriveBalances([
  transfer({ provider: "alex", recipient: "bri", minutes: 60 }),
]);
// alex: +60, bri: -60
```

**Expected observation:** replaying the exact transfer does not change balances a second time. A rejected or invalid transfer produces no postings.

## Peer Hours connection

`@peer-hours/timebank-ledger` derives balances from immutable postings. It rejects a duplicate settlement ID and applies ordinary transfers in stable transfer-ID order when enforcing the current -50-hour credit boundary. A desktop balance screen must eventually explain which local records produced its number.

## Takeaway

The balance is a conclusion, not the authoritative record. The authoritative evidence is the verified history that produced it.

## Next lesson

Continue with [Lesson 31: How one transfer changes two balances](31-two-balances.md).
