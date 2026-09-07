"use client";

import { useEffect, useState } from "react";
import { BookHeart, ChevronRight } from "lucide-react";
import { APP_CONFIG } from "../config/app.config";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

const STORAGE_KEY = "maminy-recipes:intro-seen:v1";

export function GiftIntro({ forced = false, onClose }: { forced?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setOpen(forced || (APP_CONFIG.showGiftIntro && localStorage.getItem(STORAGE_KEY) !== "yes")));
    return () => window.cancelAnimationFrame(frame);
  }, [forced]);

  const close = () => {
    localStorage.setItem(STORAGE_KEY, "yes");
    setOpen(false);
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent showCloseButton={forced} className="gift-intro max-w-[620px] overflow-hidden border-0 p-0">
        <div className="gift-intro__spine" aria-hidden="true" />
        <div className="gift-intro__content">
          <div className="gift-intro__mark" aria-hidden="true"><BookHeart /></div>
          <p className="gift-intro__eyebrow">Семейная книга</p>
          <DialogTitle className="gift-intro__title">{APP_CONFIG.appName}</DialogTitle>
          <DialogDescription className="gift-intro__description">
            <strong>{APP_CONFIG.dedicationTitle}</strong>
            {APP_CONFIG.dedicationText}
          </DialogDescription>
          <Button onClick={close} size="lg" className="gift-intro__button">
            Открыть книгу <ChevronRight />
          </Button>
          <p className="gift-intro__signature">С любовью, {APP_CONFIG.giftFrom}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
