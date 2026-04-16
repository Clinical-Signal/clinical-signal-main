import * as React from "react";
import { cn } from "@/lib/cn";

const fieldBase =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-faint " +
  "transition-colors " +
  "focus:border-accent focus:outline-none focus-visible:shadow-focus " +
  "disabled:bg-surface-sunken disabled:text-ink-subtle " +
  "aria-[invalid=true]:border-danger";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 3, ...props }, ref) => (
  <textarea ref={ref} rows={rows} className={cn(fieldBase, "leading-6", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(fieldBase, "h-10 pr-8", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";
