import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const FIELD_CLASSES =
  "rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-black/5";

// `w-full` lives here, not in FIELD_CLASSES, so a caller's own width class
// (e.g. "w-16 text-right") doesn't have to out-cascade it — Tailwind orders
// same-property utilities by its theme scale, not by class-string position,
// so "w-full ... w-16" on one element can't be trusted to prefer w-16.
// Exactly one of the two is ever present at once instead.
export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD_CLASSES} ${className ?? "w-full"}`} {...props} />;
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${FIELD_CLASSES} ${className ?? "w-full"}`} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${FIELD_CLASSES} ${className ?? "w-full"}`} {...props} />;
}

export function Label({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`mb-1 block text-xs font-medium text-foreground/70 ${className}`}>
      {children}
    </label>
  );
}
