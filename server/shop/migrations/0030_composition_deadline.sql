CREATE INDEX orders_composition_deadline ON orders (json_extract(fulfillment_state,'$.composition.expiresAt'))
WHERE json_extract(fulfillment_state,'$.composition.expiresAt') IS NOT NULL AND status IN ('placed','accepted','ready');
