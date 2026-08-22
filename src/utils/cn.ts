/**
 * DELIS — Хелпер cn() — склейка CSS-классов (clsx + tailwind-merge).
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
