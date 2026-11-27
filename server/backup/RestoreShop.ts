import { Shop } from "../shop/Shop";
import { restoreShop, type Snapshot, snapshotShop } from "./snapshot";

// No public router, Telegram, projections or alarms in the recovery namespace.
export class RestoreShop extends Shop {
  async restoreSnapshot(snapshot: Snapshot) {
    restoreShop(this.ctx.storage, snapshot);
    await this.ctx.storage.deleteAlarm();
    return snapshotShop(this.ctx.storage);
  }
  override fetch() {
    return Promise.resolve(new Response(null, { status: 404 }));
  }
  override async alarm() {}
}
