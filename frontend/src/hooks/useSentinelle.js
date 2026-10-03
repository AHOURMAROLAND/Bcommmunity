import { useEffect, useRef } from "react";

export default function useSentinelle(rappel, actif) {
  const ref = useRef(null);
  const cb = useRef(rappel);
  cb.current = rappel;
  useEffect(() => {
    if (!actif || !ref.current) return undefined;
    const o = new IntersectionObserver(([e]) => e.isIntersecting && cb.current(), { rootMargin: "400px" });
    o.observe(ref.current);
    return () => o.disconnect();
  }, [actif]);
  return ref;
}
