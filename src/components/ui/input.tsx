import * as React from "react";
export const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input">
>(({ className = "", ...props }, ref) => (
  <input ref={ref} className={`form-input ${className}`} {...props} />
));
Input.displayName = "Input";
export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className = "", ...props }, ref) => (
  <textarea ref={ref} className={`form-textarea ${className}`} {...props} />
));
Textarea.displayName = "Textarea";
