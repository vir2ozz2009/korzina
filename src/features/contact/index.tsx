import { lazy, Suspense, useState } from "react";
import { type ContactLoginMode, readTelegramAttempt, saveTelegramAttempt } from "../../shared/telegram-browser-attempt";

const Sheet = lazy(() => import("./ContactSheet").then((module) => ({ default: module.ContactSheet })));

export function ContactSheet({ mode, close }: { mode: ContactLoginMode | undefined; close: () => void }) {
  const [resume, setResume] = useState(() => readTelegramAttempt("contact"));
  const activeMode = mode ?? resume?.mode;
  if (!activeMode) return null;
  return (
    <Suspense fallback={null}>
      <Sheet
        mode={activeMode}
        resume={resume}
        close={() => {
          saveTelegramAttempt("contact");
          setResume(undefined);
          close();
        }}
      />
    </Suspense>
  );
}

export { useContact } from "./api";
