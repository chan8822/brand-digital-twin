import 'jasmine';
import { ShopifyAdapter } from "./shopify_adapter";

describe("ShopifyAdapter", () => {
  it("normalizes a Shopify order into canonical tables", () => {
    const adapter = new ShopifyAdapter(
      "test-shop.myshopify.com",
      "test-token",
      "tenant_123"
    );

    const rawOrder = {
      id: "gid://shopify/Order/12345",
      processedAt: "2026-06-03T12:00:00Z",
      currencyCode: "USD",
      displayFinancialStatus: "PAID",
      totalPriceSet: { shopMoney: { amount: "100.00" } },
      totalDiscountsSet: { shopMoney: { amount: "10.00" } },
      totalTaxSet: { shopMoney: { amount: "5.00" } },
      totalShippingPriceSet: { shopMoney: { amount: "8.00" } },
      customer: {
        id: "gid://shopify/Customer/6789",
        email: "customer@example.com",
        phone: "+15555555555",
      },
      lineItems: {
        nodes: [
          {
            id: "gid://shopify/LineItem/9876",
            quantity: 2,
            discountedUnitPriceSet: { shopMoney: { amount: "40.00" } },
            variant: {
              id: "gid://shopify/ProductVariant/54321",
              sku: "SKU-ABC",
              inventoryItem: {
                unitCost: { amount: "20.00" },
              },
            },
          },
        ],
      },
    };

    // We can cast normalizeOrder as any to test it directly since it is private
    const result = (adapter as any).normalizeOrder(rawOrder);

    // Assertions
    expect(result.order.order_id).toBe("gid://shopify/Order/12345");
    expect(result.order.customer_id).toBeDefined();
    expect(result.order.gross_revenue).toBe(100.00);
    expect(result.order.total_discounts).toBe(10.00);
    expect(result.order.total_tax).toBe(5.00);
    expect(result.order.shipping_charged).toBe(8.00);
    expect(result.order.status).toBe("PAID");

    expect(result.customer).toBeDefined();
    expect(result.customer?.customer_id).toBe(result.order.customer_id);
    expect(result.customer?.type).toBe("b2c");

    expect(result.identity_links.length).toBe(2);
    expect(result.identity_links[0].identifier_type).toBe("email");
    expect(result.identity_links[1].identifier_type).toBe("phone");

    expect(result.order_lines.length).toBe(1);
    expect(result.order_lines[0].order_line_id).toBe("gid://shopify/LineItem/9876");
    expect(result.order_lines[0].variant_id).toBe("gid://shopify/ProductVariant/54321");
    expect(result.order_lines[0].qty).toBe(2);
    expect(result.order_lines[0].unit_price).toBe(40.00);
    expect(result.order_lines[0].unit_cost).toBe(20.00);
  });
});
