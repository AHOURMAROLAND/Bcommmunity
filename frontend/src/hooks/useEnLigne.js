import { useEffect, useState } from "react";

export default function useEnLigne() {
  const [en, setEn] = useState(navigator.onLine);
  useEffect(() => {
    const f = () => setEn(navigator.onLine);
    window.addEventListener("online", f);
    window.addEventListener("offline", f);
    return () => { window.removeEventListener("online", f); window.removeEventListener("offline", f); };
  }, []);
  return en;
}
