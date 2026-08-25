/** DELIS — server-authoritative daily Stars wheel. */
import { useEffect, useState } from "react";
import { useI18n } from "./i18n";
import { claimDaily, getDailyStatus } from "./api";
import { haptic } from "./kit";
import { IconClose, IconGift, IconStarsOrbit } from "./icons";
import { Sheet } from "./chrome";
import { cn } from "./utils/cn";

const REWARDS = [10, 15, 20, 25, 30, 40, 50, 75, 100];
const COLORS = ["#E0A63C", "#3F6B52", "#C9892D", "#517B62", "#B87825", "#2E6248", "#DB9A34", "#467159", "#C1832B"];

export function WheelOfFortune({
  onWin,
  onClose,
}: {
  onWin: (amount: number, stars: number) => void;
  onClose: () => void;
}) {
  const { lang } = useI18n();
  const [isSpinning, setIsSpinning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [claimed, setClaimed] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [won, setWon] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const L = (uz: string, ru: string, en: string) => (lang === "ru" ? ru : lang === "en" ? en : uz);

  useEffect(() => {
    let active = true;
    void getDailyStatus().then((status) => {
      if (!active) return;
      setClaimed(Boolean(status?.claimed));
      setError(!status);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const handleSpin = async () => {
    if (claimed || isSpinning || loading) return;
    setIsSpinning(true);
    setError(false);
    const result = await claimDaily();
    if (!result) {
      setIsSpinning(false);
      setError(true);
      haptic("error");
      return;
    }
    const prizeIndex = Math.max(0, REWARDS.indexOf(result.amount));
    const segmentAngle = 360 / REWARDS.length;
    setRotation(360 * 5 + (360 - prizeIndex * segmentAngle - segmentAngle / 2));
    window.setTimeout(() => {
      setIsSpinning(false);
      setClaimed(true);
      setWon(result.amount);
      onWin(result.amount, result.stars);
      haptic("success");
    }, 4000);
  };

  const segmentAngle = 360 / REWARDS.length;
  return (
    <Sheet open onClose={onClose} title={L("Omad g'ildiragi", "Колесо фортуны", "Wheel of Fortune")}>
      <div className="space-y-5">
        <p className="text-center text-[13px] text-ink/60">{L("Har kuni bir marta aylantiring — natijani server himoya qiladi.", "Крутите один раз в день — результат защищён сервером.", "Spin once daily — the result is protected by the server.")}</p>

        <div className="relative mx-auto h-64 w-64">
          <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-2"><div className="h-0 w-0 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-ink" /></div>
          <div className="relative h-full w-full overflow-hidden rounded-full border-4 border-ink shadow-2xl transition-transform duration-[4000ms] ease-out" style={{ transform: `rotate(${rotation}deg)` }}>
            {REWARDS.map((reward, index) => (
              <div key={reward} className="absolute h-full w-full" style={{ transform: `rotate(${index * segmentAngle}deg)`, clipPath: `polygon(50% 50%, 50% 0%, ${50 + 50 * Math.tan((segmentAngle * Math.PI) / 360)}% 0%)` }}>
                <div className="flex h-full w-full items-start justify-center pt-4 text-[11px] font-black text-white" style={{ backgroundColor: COLORS[index] }}>{reward}</div>
              </div>
            ))}
          </div>
          <button onClick={() => void handleSpin()} disabled={claimed || isSpinning || loading} className={cn("absolute left-1/2 top-1/2 z-10 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-bold text-white shadow-xl transition-all", claimed || isSpinning || loading ? "cursor-not-allowed bg-amber/50" : "bg-amber hover:scale-105 hover:bg-pine")}>
            {isSpinning || loading ? <div className="h-6 w-6 animate-spin rounded-full border-2 border-paper border-t-transparent" /> : <IconGift size={32} />}
          </button>
        </div>

        {claimed && won == null && <p className="text-center text-[13px] font-bold text-ink/65">{L("Bugungi mukofot allaqachon olindi.", "Сегодняшняя награда уже получена.", "Today's reward has already been claimed.")}</p>}
        {error && <p className="text-center text-[12px] font-bold text-[#B3402E]">{L("Server bilan aloqa yo'q. Keyinroq urinib ko'ring.", "Нет связи с сервером. Попробуйте позже.", "Server unavailable. Try again later.")}</p>}
        {won != null && (
          <div className="animate-pop rounded-[24px] bg-gradient-to-br from-amber/20 to-amber/10 p-6 text-center">
            <IconStarsOrbit size={44} className="mx-auto text-amberdeep" />
            <p className="mt-2 text-[12px] font-medium text-ink/70">{L("Tabriklaymiz!", "Поздравляем!", "Congratulations!")}</p>
            <p className="font-display text-[22px] font-bold text-ink">+{won} DELIS Stars</p>
          </div>
        )}

        <button onClick={onClose} className="press flex h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-ink/15 bg-card text-[13px] font-bold text-ink"><IconClose size={15} /> {L("Yopish", "Закрыть", "Close")}</button>
      </div>
    </Sheet>
  );
}
