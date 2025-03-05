"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
}

export const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  ({ className, checked, onCheckedChange, size = "md", disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors",
          "hover:bg-muted hover:text-muted-foreground",
          "data-[state=on]:bg-accent data-[state=on]:text-accent-foreground",
          "disabled:pointer-events-none disabled:opacity-50",
          size === "sm" && "h-7 px-2",
          size === "md" && "h-9 px-3",
          size === "lg" && "h-11 px-5",
          className
        )}
        onClick={() => onCheckedChange?.(!checked)}
        data-state={checked ? "on" : "off"}
        {...props}
      >
        {props.children}
      </button>
    );
  }
);

Toggle.displayName = "Toggle"; 