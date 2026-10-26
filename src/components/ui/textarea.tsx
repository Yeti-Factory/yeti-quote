import * as React from "react";

import { cn } from "@/lib/utils";

type TextareaProps = React.ComponentProps<"textarea"> & {
  autoResize?: boolean;
};

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoResize = false, onInput, ...props }, forwardedRef) => {
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

    const resize = React.useCallback(() => {
      if (!autoResize || !textareaRef.current) return;
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }, [autoResize]);

    React.useLayoutEffect(() => {
      resize();
    }, [props.value, props.defaultValue, resize]);

    React.useEffect(() => {
      if (!autoResize) return;
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }, [autoResize, resize]);

    const setRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        textareaRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full cursor-text caret-primary rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          autoResize && "resize-none overflow-y-hidden",
          className,
        )}
        ref={setRef}
        onInput={(event) => {
          resize();
          onInput?.(event);
        }}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
