import { useRef } from "react";

/**
 * Gestion unifiee des gestes pointer (un doigt = deplacement,
 * deux doigts = zoom + rotation + deplacement).
 * Retourne les handlers a passer sur l'element cible.
 */
export default function useGestes(rappels) {
  const cb = useRef(rappels);
  cb.current = rappels;
  const pts = useRef(new Map());
  const prec = useRef(null);

  const mesure = () => {
    const [a, b] = [...pts.current.values()];
    return {
      d: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      ang: Math.atan2(b.y - a.y, b.x - a.x),
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
    };
  };

  const lever = (e) => {
    pts.current.delete(e.pointerId);
    prec.current = null;
    if (pts.current.size === 0) cb.current.fin?.();
  };

  return {
    onPointerDown(e) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.current.size === 1) cb.current.debut?.({ x: e.clientX, y: e.clientY });
      else if (pts.current.size === 2) prec.current = mesure();
    },
    onPointerMove(e) {
      const p = pts.current.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pts.current.size === 1) {
        cb.current.deplacer?.({ dx, dy, x: e.clientX, y: e.clientY });
      } else if (pts.current.size === 2 && prec.current) {
        const m = mesure(), o = prec.current;
        let da = m.ang - o.ang;
        if (da > Math.PI) da -= 2 * Math.PI;
        if (da < -Math.PI) da += 2 * Math.PI;
        cb.current.pincer?.({
          echelle: m.d / o.d,
          rotation: da,
          dx: m.cx - o.cx,
          dy: m.cy - o.cy,
        });
        prec.current = m;
      }
    },
    onPointerUp: lever,
    onPointerCancel: lever,
  };
}
