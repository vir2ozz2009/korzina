// One instance per request. Commands mark effects from inside the successful write callback.
export class ShopChanges {
  readonly orders = new Set<number>();
  placed = false;
  compositionDueAt?: number;
  catalogChanged = false;
  settingsChanged = false;

  order(number: number) {
    this.orders.add(number);
  }

  orderChangeDeadline(dueAt: number) {
    this.compositionDueAt = Math.min(this.compositionDueAt ?? dueAt, dueAt);
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
