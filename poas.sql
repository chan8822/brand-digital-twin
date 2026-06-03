-- Phase 0 — true contribution margin and POAS (Profit on Ad Spend).
-- Evaluates campaign performance by loading actual line unit costs (COGS),
-- subtracting refunds and prorated fulfillment costs (shipping + fees) to compute
-- order contribution margin, and attributing it to campaigns.

DECLARE tenant STRING DEFAULT 'tenant_123';

-- 1. Base order lines with line-level gross revenue and COGS
WITH line_margin AS (
  SELECT
    ol.tenant_id,
    ol.order_id,
    ol.order_line_id,
    ol.qty,
    -- gross line margin (excluding refunds/fulfillment)
    (ol.unit_price - ol.line_discount - COALESCE(ol.unit_cost, 0)) * ol.qty AS gross_line_margin,
    -- we also need unit_price * qty for revenue allocation
    (ol.unit_price - ol.line_discount) * ol.qty AS gross_line_revenue
  FROM brand_twin.order_lines ol
  WHERE ol.tenant_id = tenant
),
-- 2. Line-level refunds
line_refunds AS (
  SELECT
    r.tenant_id,
    r.order_line_id,
    SUM(r.amount) AS refunded
  FROM brand_twin.refunds r
  WHERE r.tenant_id = tenant
  GROUP BY r.tenant_id, r.order_line_id
),
-- 3. Order-level gross revenue (used to allocate order-level fulfillment costs)
order_revenue AS (
  SELECT
    tenant_id,
    order_id,
    SUM(gross_line_revenue) AS order_gross_revenue
  FROM line_margin
  GROUP BY tenant_id, order_id
),
-- Prorate order-level fulfillment costs (shipping_cost + marketplace_fee)
-- to each line item based on its share of gross order revenue.
line_fulfillment AS (
  SELECT
    lm.tenant_id,
    lm.order_id,
    lm.order_line_id,
    CASE
      WHEN orr.order_gross_revenue > 0
        THEN ((lm.gross_line_revenue / orr.order_gross_revenue) * (COALESCE(fc.shipping_cost, 0) + COALESCE(fc.marketplace_fee, 0)))
      ELSE 0
    END AS alloc_fulfillment
  FROM line_margin lm
  JOIN order_revenue orr USING (tenant_id, order_id)
  LEFT JOIN brand_twin.fulfillment_costs fc USING (tenant_id, order_id)
  WHERE lm.tenant_id = tenant
),
-- 4. Combine line elements to get contribution margin
line_contrib AS (
  SELECT
    lm.tenant_id,
    lm.order_id,
    lm.gross_line_margin
      - COALESCE(lr.refunded, 0)
      - COALESCE(lf.alloc_fulfillment, 0) AS contribution_margin
  FROM line_margin lm
  LEFT JOIN line_refunds lr USING (tenant_id, order_line_id)
  LEFT JOIN line_fulfillment lf USING (tenant_id, order_line_id)
),
order_contrib AS (
  SELECT tenant_id, order_id, SUM(contribution_margin) AS order_contribution
  FROM line_contrib
  GROUP BY tenant_id, order_id
),
-- 5. Attribution: order -> campaign. Last-touch (swap this CTE for MMM/position-based later).
-- In Phase 0, we look for the last click touchpoint before the order placed_at.
order_attribution AS (
  SELECT
    o.tenant_id,
    o.order_id,
    -- Last-touch campaign id
    ARRAY_AGG(
      tp.campaign_id
      ORDER BY tp.occurred_at DESC
      LIMIT 1
    )[OFFSET(0)] AS attributed_campaign_id
  FROM brand_twin.orders o
  JOIN brand_twin.touchpoints tp ON o.customer_id = tp.customer_id
    AND tp.occurred_at <= o.placed_at
    AND tp.occurred_at >= TIMESTAMP_SUB(o.placed_at, INTERVAL 30 DAY) -- 30-day window
  WHERE o.tenant_id = tenant
  GROUP BY o.tenant_id, o.order_id
),
-- 6. Aggregate margin at campaign level
campaign_margin AS (
  SELECT
    att.tenant_id,
    COALESCE(att.attributed_campaign_id, 'ORGANIC') AS campaign_id,
    SUM(oc.order_contribution) AS contribution_margin
  FROM order_contrib oc
  LEFT JOIN order_attribution att USING (tenant_id, order_id)
  GROUP BY att.tenant_id, campaign_id
),
-- 7. Campaign spend
campaign_spend AS (
  SELECT
    sf.tenant_id,
    sf.campaign_id,
    SUM(sf.amount) AS total_spend
  FROM brand_twin.spend_facts sf
  WHERE sf.tenant_id = tenant
  GROUP BY sf.tenant_id, sf.campaign_id
)
-- 8. Final POAS output: Contribution Margin / Spend
-- Highlight unprofitable campaigns (POAS < 1.0)
SELECT
  c.name AS campaign_name,
  c.platform,
  c.status,
  COALESCE(cs.total_spend, 0) AS spend,
  COALESCE(cm.contribution_margin, 0) AS contribution_margin,
  CASE
    WHEN COALESCE(cs.total_spend, 0) > 0 
      THEN ROUND(COALESCE(cm.contribution_margin, 0) / cs.total_spend, 2)
    ELSE NULL -- Infinite POAS (no spend, but margin generated)
  END AS poas
FROM brand_twin.campaigns c
LEFT JOIN campaign_margin cm ON c.campaign_id = cm.campaign_id AND c.tenant_id = cm.tenant_id
LEFT JOIN campaign_spend cs ON c.campaign_id = cs.campaign_id AND c.tenant_id = cs.tenant_id
WHERE c.tenant_id = tenant
ORDER BY poas ASC, spend DESC;
