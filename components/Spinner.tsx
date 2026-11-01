import styles from "./desktop.module.css";

/** The 12-spoke macOS progress indicator. */
export function Spinner({ size = 28 }: { size?: number }) {
  return (
    <span className={styles.spinner} style={{ width: size, height: size }} aria-label="Loading" role="status">
      {Array.from({ length: 12 }, (_, i) => (
        <i key={i} style={{ transform: `rotate(${i * 30}deg)`, animationDelay: `${-1 + i / 12}s` }} />
      ))}
    </span>
  );
}
