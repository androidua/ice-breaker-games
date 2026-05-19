import { useEffect, useRef, useState } from "react";

export default function GameInstructions({ title, rules }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  return (
    <span className="help-wrap" ref={containerRef}>
      <button
        type="button"
        className="help-icon"
        aria-label="How to play"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
      >
        ?
      </button>
      {isOpen && (
        <div className="help-popover" role="dialog" aria-label={`How to play ${title}`}>
          <div className="help-popover-title">How to play · {title}</div>
          <ul className="help-popover-rules">
            {rules.map((rule, i) => (
              <li key={i}>{rule}</li>
            ))}
          </ul>
          <button
            type="button"
            className="help-popover-close"
            onClick={() => setIsOpen(false)}
          >
            Got it
          </button>
        </div>
      )}
    </span>
  );
}
