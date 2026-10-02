import { useEffect, useState } from "react";

export default function useDebounce(valeur, delai = 300) {
  const [v, setV] = useState(valeur);
  useEffect(() => {
    const t = setTimeout(() => setV(valeur), delai);
    return () => clearTimeout(t);
  }, [valeur, delai]);
  return v;
}
