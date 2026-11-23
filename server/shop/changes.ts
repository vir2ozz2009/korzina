// One instance per request. Commands mark effects from inside the successful write callback.
export class ShopChanges {
  readonly orders = new Set<number>();
  placed = false;
  catalogChanged = false;
  settingsChanged = false;

  order(number: number) {
    this.orders.add(number);
  }

  orderPlaced(number: number) {
    this.placed = true;
    this.order(number);
  }

  catalog() {
    this.catalogChanged = true;
  }

  settings() {
    this.settingsChanged = true;
  }
}
