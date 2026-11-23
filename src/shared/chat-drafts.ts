import type { ChatSend } from "./contracts/order-chat";

type Draft = { text: string; mediaId?: string; attempt?: { body: ChatSend; command: string } };
const prefix = "korzina:chat-draft:";

export function readChatDraft(key: string): Draft {
  try {
    return JSON.parse(sessionStorage.getItem(prefix + key) ?? "null") ?? { text: "" };
  } catch {
    return { text: "" };
  }
}

export function writeChatDraft(key: string, draft?: Draft) {
  try {
    if (draft) sessionStorage.setItem(prefix + key, JSON.stringify(draft));
    else sessionStorage.removeItem(prefix + key);
  } catch {
    /* Session storage is optional. */
  }
}

export function clearChatDrafts() {
  try {
    const keys = Object.keys(sessionStorage).filter((key) => key.startsWith(prefix));
    for (const key of keys) sessionStorage.removeItem(key);
  } catch {
    /* Session storage is optional. */
  }
}
