import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50",
    {
        variants: {
            variant: { default: "bg-brand text-white hover:bg-[#185744]", outline: "border border-[#cbd8d3] bg-white hover:bg-[#eef3ef]", ghost: "hover:bg-[#eef3ef]" },
            size: { default: "h-11", sm: "h-9 px-3", lg: "h-12 px-6" },
        }, defaultVariants: { variant: "default", size: "default" }
    },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ asChild = false, className, variant, size, ...props }: Props) {
    const Component = asChild ? Slot : "button";
    return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
