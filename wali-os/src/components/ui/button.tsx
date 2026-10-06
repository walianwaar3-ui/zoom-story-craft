import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg font-heading text-sm font-bold transition-all outline-none disabled:pointer-events-none disabled:opacity-80 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-brand-highlight aria-invalid:border-destructive aria-invalid:ring-destructive/20",
  {
    variants: {
      variant: {
        // Glowing primary (Systems of Change); hover lifts unless disabled.
        default:
          "bg-primary text-primary-foreground shadow-glow hover:brightness-110 hover:-translate-y-px hover:[box-shadow:var(--brand-glow-hover)] disabled:translate-y-0",
        destructive:
          "bg-danger text-white shadow-xs hover:brightness-110 dark:bg-danger-bg dark:text-danger",
        outline:
          "border bg-card text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "font-sans font-semibold text-primary underline-offset-4 hover:underline dark:text-brand-tag",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    // Dense contexts (small sizes): reduced glow.
    compoundVariants: [
      { variant: "default", size: ["sm", "icon", "icon-sm"], class: "shadow-glow-sm hover:[box-shadow:var(--brand-glow-sm)]" },
    ],
    defaultVariants: { variant: "default", size: "default" },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
