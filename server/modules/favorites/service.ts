export function favoriteIds(storage: DurableObjectStorage, customer: string) {
  return storage.sql
    .exec<{ product_id: string }>(
      "SELECT product_id FROM buyer_favorites WHERE customer=? ORDER BY added_at DESC, product_id",
      customer,
    )
    .toArray()
    .map(({ product_id }) => product_id);
}

export function mergeFavoriteIds(storage: DurableObjectStorage, customer: string, ids: string[]) {
  const unique = [...new Set(ids)];
  storage.sql.exec(
    `INSERT INTO buyer_favorites(customer,product_id,added_at)
     SELECT ?,value,?-CAST(key AS INTEGER) FROM json_each(?) WHERE 1
     ON CONFLICT(customer,product_id) DO NOTHING`,
    customer,
    Date.now(),
    JSON.stringify(unique),
  );
}

export function mergeCustomerFavorites(storage: DurableObjectStorage, source: string, target: string) {
  storage.sql.exec(
    `INSERT INTO buyer_favorites(customer,product_id,added_at)
     SELECT ?,product_id,added_at FROM buyer_favorites WHERE customer=?
     ON CONFLICT(customer,product_id) DO UPDATE SET added_at=MAX(added_at,excluded.added_at)`,
    target,
    source,
  );
  storage.sql.exec("DELETE FROM buyer_favorites WHERE customer=?", source);
}
