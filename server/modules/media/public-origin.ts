import { isLocal } from "../../auth/cookies";

export function publicMediaOrigin(request: Request, remote: string) {
  return isLocal(request) ? `${new URL(request.url).origin}/api/media-public` : remote;
}
