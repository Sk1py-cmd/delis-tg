const brandAsset = (file: string) => `${import.meta.env.BASE_URL}brand/${file}`;

/** Exact owner-supplied pixel crops with only the white source matte removed. */
export function BrandMark({ className = "", size = 32 }: { className?: string; size?: number }) {
  return <img src={brandAsset("delis-mark.png")} width={size} height={size} alt="" aria-hidden className={`select-none object-contain ${className}`} />;
}

export function BrandWordmark({ className = "" }: { className?: string }) {
  return <img src={brandAsset("delis-wordmark.png")} alt="DELIS" className={`select-none object-contain ${className}`} />;
}

export function BrandLockup({ className = "" }: { className?: string }) {
  return <img src={brandAsset("delis-lockup.png")} alt="DELIS — Home & Auto Care" className={`select-none object-contain ${className}`} />;
}
