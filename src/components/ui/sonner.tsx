"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useMediaQuery } from "@/hooks/use-media-query"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  // Bottom centre above the bottom nav on phones, bottom right on desktop (design-system §5).
  const desktop = useMediaQuery("(min-width: 768px)")
  return (
    <Sonner
      position={desktop ? "bottom-right" : "bottom-center"}
      mobileOffset={{ bottom: 88 }}
      theme="light" // light only in M1; dark mode is M2
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
