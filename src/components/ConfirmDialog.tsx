import { useState } from "react";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string | string[];
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm();
      onCancel();
    } finally {
      setSubmitting(false);
    }
  }

  const paragraphs = Array.isArray(body) ? body : [body];

  return (
    <AlertDialog open onOpenChange={(open) => !open && !submitting && onCancel()}>
      <AlertDialogContent
        className="sm:max-w-md"
        style={{
          background: "var(--surface-high)",
          borderColor: "var(--line)",
          boxShadow: "var(--lift-3)",
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle
            className="f-serif"
            style={{ fontSize: 18, fontWeight: 500, color: "var(--ink)" }}
          >
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {paragraphs.map((paragraph, index) => (
                <p
                  key={index}
                  className="f-serif"
                  style={{
                    margin: 0,
                    fontSize: 13,
                    fontStyle: "italic",
                    color: "var(--ink-soft)",
                    lineHeight: 1.55,
                  }}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button type="button" disabled={submitting} variant="outline" size="sm">
              Cancel
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                handleConfirm();
              }}
              disabled={submitting}
              autoFocus
              variant={danger ? "destructive" : "default"}
              size="sm"
            >
              {submitting ? "Working..." : confirmLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
