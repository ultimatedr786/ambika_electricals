"use client";

import * as React from "react";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { useIsDesktopDialog } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

const widths = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-xl",
  xl: "sm:max-w-2xl",
  "2xl": "sm:max-w-3xl",
} as const;

export type FormDialogSize = keyof typeof widths;

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Sticky action row. Rendered inside the dialog/sheet footer. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  size?: FormDialogSize;
  /** Extra classes for the scrollable body. */
  bodyClassName?: string;
  contentClassName?: string;
  /**
   * Wrap header/body/footer in a <form>. Keeps the sticky footer's submit
   * button connected to the scrollable fields above it.
   */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
}

/**
 * The single responsive dialog pattern used by every create/edit form
 * (product, customer, reward, rule, store, staff, challenge, profile, sale).
 *
 * - Desktop / roomy viewports: centred dialog with a practical max width and
 *   a bounded max height.
 * - Narrow or short viewports (mobile, portrait tablet, mobile landscape):
 *   a full-height bottom sheet, so two-column desktop fields never get
 *   squeezed or clipped.
 *
 * In both cases the structure is identical: sticky header → scrollable
 * content → sticky action footer.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  size = "md",
  bodyClassName,
  contentClassName,
  onSubmit,
}: FormDialogProps) {
  const isDesktop = useIsDesktopDialog();

  const shell = (body: React.ReactNode) =>
    onSubmit ? (
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        {body}
      </form>
    ) : (
      <div className="flex min-h-0 flex-1 flex-col">{body}</div>
    );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn(widths[size], contentClassName)}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {shell(
            <>
              <DialogBody className={bodyClassName}>{children}</DialogBody>
              {footer ? <DialogFooter>{footer}</DialogFooter> : <div className="h-5 shrink-0" />}
            </>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className={cn("h-[92dvh] max-h-[92dvh]", contentClassName)}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        {shell(
          <>
            <SheetBody className={bodyClassName}>{children}</SheetBody>
            {footer ? (
              <SheetFooter className="[&>*]:w-full sm:[&>*]:w-auto">{footer}</SheetFooter>
            ) : (
              <div className="safe-bottom h-2 shrink-0" />
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
