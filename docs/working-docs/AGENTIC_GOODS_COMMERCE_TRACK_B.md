# Track B: Agentic Goods Commerce (future)

## Status
Documented future track — not implemented. Builds on the provider-pluggable foundations from Agentic Tab Payments.

## What Track A (Supertab) covers
- Digital content unlocks (recipe cooking sessions)
- Micropayments via Supertab Tab
- Session spend mandates for voice/agent charges
- Webhook-reconciled entitlements

## What Track B adds
Physical goods commerce: "buy my shopping list" requires a **commerce provider** (UCP/AP2/ACP merchant or aggregator), not Supertab.

### Reused from Track A
| Primitive | Track A usage | Track B usage |
|-----------|---------------|---------------|
| `SpendMandate` | Recipe unlock ceiling | Grocery cart ceiling |
| `PurchaseIntent` | `recipe_unlock` | `goods_cart` |
| `PaymentProvider` adapter | `SupertabProvider` | `UcpMerchantProvider` / `StripeAcpProvider` |
| `/api/v1/webhooks/{provider}` | Supertab events | Merchant fulfillment events |
| Agent tool → intent | `request_supertab_unlock` | `request_goods_purchase` |

### New for Track B
1. **Commerce provider adapter** implementing `PaymentProvider`:
   - `create_offer(cart)` → merchant checkout session / UCP cart
   - `map_event` → order status updates
2. **Physical goods data model** (alongside `entitlements`):
   - `carts` / `cart_items`
   - `orders` / `order_items`
   - Fulfillment status, substitutions, refunds
3. **Agent tool**: `request_goods_purchase(shopping_list_id)` emitting a neutral `PurchaseIntent` with `intent_type: goods_cart`.

## Integration seam
The `PaymentProvider` protocol in `payment_provider.py` is the plug-in point:

```python
class PaymentProvider(Protocol):
    provider_name: str
    def verify_webhook(...) -> dict: ...
    def map_event(...) -> Optional[ReconcileEvent]: ...
```

Adding goods commerce = implement one more adapter + orders model. No rewrite of mandate, webhook, or agent-trigger plumbing.

## Candidate commerce providers
- UCP-compatible merchant endpoints
- Stripe Agentic Commerce Protocol (ACP)
- Instacart / Tesco / aggregator APIs exposing UCP discovery

## Out of scope until Track B
- Fulfillment logistics
- Refund/dispute handling
- Multi-merchant cart splitting
