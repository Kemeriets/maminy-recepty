import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ref, onChange, ...props }: React.ComponentProps<"textarea">) {
  const localRef = React.useRef<HTMLTextAreaElement | null>(null)
  const resize = React.useCallback(() => {
    const element = localRef.current
    if (!element) return
    element.style.height = "auto"
    const computed = getComputedStyle(element)
    const border = parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth)
    const limit = Math.max(160, Math.min(480, window.innerHeight * .55))
    const height = element.scrollHeight + border
    element.style.height = `${Math.min(height, limit)}px`
    element.style.overflowY = height > limit ? "auto" : "hidden"
  }, [])
  React.useLayoutEffect(() => { resize() })
  React.useEffect(() => {
    window.addEventListener("resize", resize)
    let previousWidth = 0
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0
      if (width !== previousWidth) { previousWidth = width; resize() }
    })
    if (localRef.current) observer?.observe(localRef.current)
    return () => { window.removeEventListener("resize", resize); observer?.disconnect() }
  }, [resize])
  return (
    <textarea
      ref={(element) => {
        localRef.current = element
        if (typeof ref === "function") ref(element)
        else if (ref) ref.current = element
      }}
      onChange={(event) => { onChange?.(event); resize() }}
      data-slot="textarea"
      className={cn(
        "flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
