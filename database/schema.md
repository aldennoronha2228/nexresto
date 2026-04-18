# Firestore Schema (High-level)

## Core collections

- `restaurants/{restaurantId}`
- `restaurants/{restaurantId}/orders/{orderId}`
- `restaurants/{restaurantId}/menu_items/{itemId}`
- `restaurants/{restaurantId}/categories/{categoryId}`
- `restaurants/{restaurantId}/inventory_items/{itemId}`
- `restaurants/{restaurantId}/staff/{uid}`
- `restaurants/{restaurantId}/customers/{customerId}`
- `restaurants/{restaurantId}/analytics/{dateKey}`
- `branding/{restaurantId}`

## Notes

- Keep tenant isolation by always scoping reads/writes with `restaurantId`.
- Use server-side authz checks for all management operations.
