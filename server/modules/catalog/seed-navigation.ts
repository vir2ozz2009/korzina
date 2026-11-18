// B3 demo-only addition: stable product/SKU ids and existing carts remain intact.
export function seedNavigation(storage: DurableObjectStorage) {
  const marker = storage.sql
    .exec<{ value: string }>("SELECT value FROM settings WHERE key='catalog_navigation_seed'")
    .toArray()[0];
  if (marker?.value === "B3") return;
  storage.transactionSync(() => {
    for (const [id, name, product] of [
      ["home-tomatoes", "Томаты", "product-01"],
      ["home-mixes", "Овощные смеси", "product-09"],
    ]) {
      storage.sql.exec(
        "INSERT INTO categories(id,name,parent_id,position) VALUES(?,?,'home',0) ON CONFLICT(id) DO NOTHING",
        id,
        name,
      );
      storage.sql.exec("UPDATE products SET category_id=? WHERE id=? AND category_id='home'", id, product);
    }
    storage.sql.exec(
      "INSERT INTO settings(key,value) VALUES('catalog_navigation_seed','B3') ON CONFLICT(key) DO UPDATE SET value='B3'",
    );
  });
}
