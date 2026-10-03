export function LoadingIndicator({ type = "dot-circle", size = "md", label, className = "" }) {
  const dimensions = {
    sm: 20,
    md: 32,
    lg: 48,
  }[size] || 32;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`indicateur-chargement ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.6rem",
      }}
    >
      {type === "dot-circle" ? (
        <svg
          width={dimensions}
          height={dimensions}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="rotation-douce"
          style={{ animation: "spin 1.2s linear infinite" }}
        >
          <circle cx="16" cy="4" r="2.5" fill="var(--accent)" opacity="1" />
          <circle cx="24.48" cy="7.52" r="2.5" fill="var(--accent)" opacity="0.875" />
          <circle cx="28" cy="16" r="2.5" fill="var(--accent)" opacity="0.75" />
          <circle cx="24.48" cy="24.48" r="2.5" fill="var(--accent)" opacity="0.625" />
          <circle cx="16" cy="28" r="2.5" fill="var(--accent)" opacity="0.5" />
          <circle cx="7.52" cy="24.48" r="2.5" fill="var(--accent)" opacity="0.375" />
          <circle cx="4" cy="16" r="2.5" fill="var(--accent)" opacity="0.25" />
          <circle cx="7.52" cy="7.52" r="2.5" fill="var(--accent)" opacity="0.125" />
        </svg>
      ) : (
        <svg
          width={dimensions}
          height={dimensions}
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ animation: "spin 0.9s linear infinite" }}
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      )}

      {label && (
        <span
          style={{
            fontSize: size === "sm" ? "0.82rem" : size === "lg" ? "1.1rem" : "0.95rem",
            fontWeight: 500,
            color: "var(--texte-doux, var(--texte))",
          }}
        >
          {label}
        </span>
      )}
      <span className="sr-only">{label || "Chargement..."}</span>
    </div>
  );
}

export const DotCircleWithLabelDemo = () => {
  return <LoadingIndicator type="dot-circle" size="md" label="Loading..." />;
};
