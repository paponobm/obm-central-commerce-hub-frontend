import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card border border-black/5 bg-card p-5 shadow-card ${className}`}
    >
      {children}
    </div>
  );
}
