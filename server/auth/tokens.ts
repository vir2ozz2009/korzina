import { ApiError } from "../../src/shared/errors";
import { digest } from "../middleware/idempotency";

export { digest };
export const newToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) => v.toString(16).padStart(2, "0")).join("");
export async function tokenHash(token: string): Promise<string> {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new ApiError("UNAUTHORIZED", "Сессия недействительна");
  return digest(token);
}
