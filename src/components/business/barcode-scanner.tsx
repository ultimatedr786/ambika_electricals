"use client";

import * as React from "react";
import { AlertTriangle, Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Real camera barcode scanning via ZXing — decodes standard 1D retail
 * barcodes (EAN-13, EAN-8, UPC-A, Code128, Code39...) and QR as a bonus, using
 * getUserMedia + continuous frame decoding. Nothing here is simulated: on a
 * device with no camera or a denied permission, this reports that honestly
 * instead of pretending to scan.
 */
export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onDetected,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDetected: (code: string) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const controlsRef = React.useRef<{ stop: () => void } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setReady(false);

    void (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        if (cancelled || !videoRef.current) return;
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current,
          (result) => {
            if (result && !cancelled) {
              onDetected(result.getText());
              onOpenChange(false);
            }
          }
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
            ? "Camera permission was denied. Allow camera access and try again."
            : err instanceof DOMException && err.name === "NotFoundError"
              ? "No camera was found on this device."
              : "Couldn't start the camera. You can still type the barcode in manually.";
        setError(message);
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, onDetected, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Camera className="size-4.5" /> Scan barcode</DialogTitle>
          <DialogDescription>Point the camera at the product&apos;s barcode.</DialogDescription>
        </DialogHeader>
        <DialogBody className="pb-5">
          {error ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center">
              <AlertTriangle className="size-6 text-warning" aria-hidden />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}><X /> Close</Button>
            </div>
          ) : (
            <div className="relative mx-auto aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-950">
              <video ref={videoRef} className="size-full object-cover" muted playsInline />
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-950/80 text-xs text-white/70">
                  <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Starting camera…
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_14px_hsl(var(--primary))]" aria-hidden />
              <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-dashed border-white/25" aria-hidden />
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
