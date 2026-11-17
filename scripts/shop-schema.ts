import { z } from "zod";
import { shopSpec } from "../src/shared/contracts/shop-spec.ts";

// Existing shop contract is also consumable by import tooling outside this repository.
console.log(JSON.stringify(z.toJSONSchema(shopSpec), null, 2));
