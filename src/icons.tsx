/**
 * DELIS icon system — Phosphor Duotone for a consistent premium interface,
 * plus bespoke Graphite Digital glyphs for loyalty moments.
 */
import type { ComponentType } from "react";
import { ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { ArrowUUpLeft } from "@phosphor-icons/react/ArrowUUpLeft";
import { Armchair } from "@phosphor-icons/react/Armchair";
import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { Bag } from "@phosphor-icons/react/Bag";
import { Bank } from "@phosphor-icons/react/Bank";
import { Bell } from "@phosphor-icons/react/Bell";
import { Broadcast } from "@phosphor-icons/react/Broadcast";
import { Briefcase } from "@phosphor-icons/react/Briefcase";
import { Buildings } from "@phosphor-icons/react/Buildings";
import { Calculator } from "@phosphor-icons/react/Calculator";
import { CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { Camera } from "@phosphor-icons/react/Camera";
import { CaretRight } from "@phosphor-icons/react/CaretRight";
import { CarProfile } from "@phosphor-icons/react/CarProfile";
import { ChartLineUp } from "@phosphor-icons/react/ChartLineUp";
import { ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { Check } from "@phosphor-icons/react/Check";
import { ClipboardText } from "@phosphor-icons/react/ClipboardText";
import { Clock } from "@phosphor-icons/react/Clock";
import { Confetti } from "@phosphor-icons/react/Confetti";
import { CookingPot } from "@phosphor-icons/react/CookingPot";
import { Copy } from "@phosphor-icons/react/Copy";
import { CreditCard } from "@phosphor-icons/react/CreditCard";
import { Crown } from "@phosphor-icons/react/Crown";
import { Diamond } from "@phosphor-icons/react/Diamond";
import { DotsThree } from "@phosphor-icons/react/DotsThree";
import { DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { Factory } from "@phosphor-icons/react/Factory";
import { FileText } from "@phosphor-icons/react/FileText";
import { FilmStrip } from "@phosphor-icons/react/FilmStrip";
import { Fire } from "@phosphor-icons/react/Fire";
import { Flask } from "@phosphor-icons/react/Flask";
import { GearSix } from "@phosphor-icons/react/GearSix";
import { Gift } from "@phosphor-icons/react/Gift";
import { Handbag } from "@phosphor-icons/react/Handbag";
import { HandWaving } from "@phosphor-icons/react/HandWaving";
import { Heart } from "@phosphor-icons/react/Heart";
import { House } from "@phosphor-icons/react/House";
import { IdentificationCard } from "@phosphor-icons/react/IdentificationCard";
import { Image } from "@phosphor-icons/react/Image";
import { InstagramLogo } from "@phosphor-icons/react/InstagramLogo";
import { Key } from "@phosphor-icons/react/Key";
import { Leaf } from "@phosphor-icons/react/Leaf";
import { Lightbulb } from "@phosphor-icons/react/Lightbulb";
import { Link } from "@phosphor-icons/react/Link";
import { Lock } from "@phosphor-icons/react/Lock";
import { LockKey } from "@phosphor-icons/react/LockKey";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { MapPin } from "@phosphor-icons/react/MapPin";
import { MapTrifold } from "@phosphor-icons/react/MapTrifold";
import { Medal } from "@phosphor-icons/react/Medal";
import { MedalMilitary } from "@phosphor-icons/react/MedalMilitary";
import { Megaphone } from "@phosphor-icons/react/Megaphone";
import { Microscope } from "@phosphor-icons/react/Microscope";
import { Minus } from "@phosphor-icons/react/Minus";
import { Money } from "@phosphor-icons/react/Money";
import { MoonStars } from "@phosphor-icons/react/MoonStars";
import { Motorcycle } from "@phosphor-icons/react/Motorcycle";
import { NotePencil } from "@phosphor-icons/react/NotePencil";
import { Package } from "@phosphor-icons/react/Package";
import { PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { Pause } from "@phosphor-icons/react/Pause";
import { Phone } from "@phosphor-icons/react/Phone";
import { Play } from "@phosphor-icons/react/Play";
import { Plus } from "@phosphor-icons/react/Plus";
import { Printer } from "@phosphor-icons/react/Printer";
import { QrCode } from "@phosphor-icons/react/QrCode";
import { Receipt } from "@phosphor-icons/react/Receipt";
import { RocketLaunch } from "@phosphor-icons/react/RocketLaunch";
import { Scales } from "@phosphor-icons/react/Scales";
import { ShareNetwork } from "@phosphor-icons/react/ShareNetwork";
import { Shield } from "@phosphor-icons/react/Shield";
import { ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { ShoppingCart } from "@phosphor-icons/react/ShoppingCart";
import { Sparkle } from "@phosphor-icons/react/Sparkle";
import { SquaresFour } from "@phosphor-icons/react/SquaresFour";
import { Star } from "@phosphor-icons/react/Star";
import { Storefront } from "@phosphor-icons/react/Storefront";
import { Sun } from "@phosphor-icons/react/Sun";
import { Tag } from "@phosphor-icons/react/Tag";
import { TelegramLogo } from "@phosphor-icons/react/TelegramLogo";
import { ThumbsUp } from "@phosphor-icons/react/ThumbsUp";
import { Trash } from "@phosphor-icons/react/Trash";
import { Tray } from "@phosphor-icons/react/Tray";
import { Tree } from "@phosphor-icons/react/Tree";
import { Trophy } from "@phosphor-icons/react/Trophy";
import { Truck } from "@phosphor-icons/react/Truck";
import { UploadSimple } from "@phosphor-icons/react/UploadSimple";
import { User } from "@phosphor-icons/react/User";
import { UserCheck } from "@phosphor-icons/react/UserCheck";
import { UsersThree } from "@phosphor-icons/react/UsersThree";
import { Wall } from "@phosphor-icons/react/Wall";
import { Wrench } from "@phosphor-icons/react/Wrench";
import { X } from "@phosphor-icons/react/X";
import { YoutubeLogo } from "@phosphor-icons/react/YoutubeLogo";
import type { IconProps as PhosphorIconProps } from "@phosphor-icons/react";

export type IconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
  filled?: boolean;
};

type MotionKind = "arrow" | "bag" | "bell" | "heart" | "qr" | "refresh" | "sparkle" | "trash";
type PhosphorGlyph = ComponentType<PhosphorIconProps>;

function icon(Glyph: PhosphorGlyph, motion?: MotionKind) {
  return function DelisIcon({ size = 22, className = "", strokeWidth = 2, filled = false }: IconProps) {
    const weight = filled ? "fill" : strokeWidth >= 2.5 ? "bold" : strokeWidth <= 1.4 ? "light" : "duotone";
    return (
      <Glyph
        aria-hidden="true"
        focusable="false"
        size={size}
        weight={weight}
        className={`delis-icon${motion ? ` delis-icon--${motion}` : ""}${className ? ` ${className}` : ""}`}
      />
    );
  };
}

export const IconClose = icon(X);
export const IconDots = icon(DotsThree);
export const IconHome = icon(House);
export const IconGrid = icon(SquaresFour);
export const IconBag = icon(Handbag, "bag");
export const IconBox = icon(Package);
export const IconUser = icon(User);
export const IconArrow = icon(ArrowRight, "arrow");
export const IconPlus = icon(Plus);
export const IconMinus = icon(Minus);
export const IconCheck = icon(Check);
export const IconPlay = icon(Play);
export const IconPause = icon(Pause);
export const IconPhone = icon(Phone);
export const IconSend = icon(PaperPlaneTilt, "arrow");
export const IconMail = icon(EnvelopeSimple);
export const IconPin = icon(MapPin);
export const IconTelegram = icon(TelegramLogo);
export const IconInstagram = icon(InstagramLogo);
export const IconYoutube = icon(YoutubeLogo);
export const IconSparkle = icon(Sparkle, "sparkle");
export const IconLeaf = icon(Leaf);
export const IconFlask = icon(Flask);
export const IconShield = icon(Shield);
export const IconFactory = icon(Factory);
export const IconChevron = icon(CaretRight, "arrow");
export const IconClock = icon(Clock);
export const IconGift = icon(Gift);
export const IconBell = icon(Bell, "bell");
export const IconMoon = icon(MoonStars, "sparkle");
export const IconSun = icon(Sun, "sparkle");
export const IconSearch = icon(MagnifyingGlass);
export const IconTruck = icon(Truck);
export const IconCreditCard = icon(CreditCard);
export const IconReceipt = icon(Receipt);
export const IconTag = icon(Tag);
export const IconStore = icon(Storefront);
export const IconLock = icon(Lock);
export const IconCalendar = icon(CalendarBlank);
export const IconCamera = icon(Camera);
export const IconCopy = icon(Copy);
export const IconRefresh = icon(ArrowsClockwise, "refresh");
export const IconRepeat = icon(ArrowCounterClockwise, "refresh");
export const IconReturn = icon(ArrowUUpLeft, "arrow");
export const IconDownload = icon(DownloadSimple, "arrow");
export const IconBuilding = icon(Buildings);
export const IconCash = icon(Money);
export const IconStar = icon(Star, "sparkle");
export const IconHeart = icon(Heart, "heart");
export const IconShare = icon(ShareNetwork);
export const IconCrown = icon(Crown);
export const IconMedal = icon(Medal);
export const IconThumbUp = icon(ThumbsUp);
export const IconScale = icon(Scales);
export const IconQrScan = icon(QrCode, "qr");
export const IconRibbon = icon(MedalMilitary);
export const IconClipboard = icon(ClipboardText);
export const IconChart = icon(ChartLineUp);
export const IconSettings = icon(GearSix, "refresh");
export const IconFileText = icon(FileText);
export const IconExternalLink = icon(ArrowSquareOut, "arrow");
export const IconShieldCheck = icon(ShieldCheck);
export const IconUserCheck = icon(UserCheck);
export const IconTrash = icon(Trash, "trash");
export const IconCart = icon(ShoppingCart, "bag");
export const IconBank = icon(Bank);
export const IconCar = icon(CarProfile);
export const IconFire = icon(Fire, "sparkle");
export const IconWave = icon(HandWaving, "bell");
export const IconBriefcase = icon(Briefcase);
export const IconLightbulb = icon(Lightbulb, "sparkle");
export const IconMegaphone = icon(Megaphone, "bell");
export const IconTrophy = icon(Trophy);
export const IconKey = icon(Key);
export const IconPrinter = icon(Printer);
export const IconCalculator = icon(Calculator);
export const IconId = icon(IdentificationCard);
export const IconWrench = icon(Wrench);
export const IconNote = icon(NotePencil);
export const IconFilm = icon(FilmStrip);
export const IconImage = icon(Image);
export const IconMicroscope = icon(Microscope);
export const IconMap = icon(MapTrifold);
export const IconMotorcycle = icon(Motorcycle);
export const IconLink = icon(Link);
export const IconUpload = icon(UploadSimple, "arrow");
export const IconChat = icon(ChatCircleDots);
export const IconConfetti = icon(Confetti, "sparkle");
export const IconArrowLeft = icon(ArrowLeft, "arrow");
export const IconUsers = icon(UsersThree);
export const IconRocket = icon(RocketLaunch, "arrow");

const legacySymbolGlyphs: Record<string, PhosphorGlyph> = {
  "✨": Sparkle,
  "⚡": Sparkle,
  "⏳": Clock,
  "❤️": Heart,
  "🎁": Gift,
  "🎀": Gift,
  "🎉": Confetti,
  "🆕": Sparkle,
  "💡": Lightbulb,
  "📦": Package,
  "📊": ChartLineUp,
  "🚚": Truck,
  "🔔": Bell,
  "💵": Money,
  "💰": Money,
  "💳": CreditCard,
  "💾": DownloadSimple,
  "⬇️": DownloadSimple,
  "🏠": House,
  "🚗": CarProfile,
  "💼": Briefcase,
  "📍": MapPin,
  "🔥": Fire,
  "✅": Check,
  "🛒": ShoppingCart,
  "📋": ClipboardText,
  "👈": ArrowLeft,
  "🏢": Buildings,
  "📅": CalendarBlank,
  "🔍": MagnifyingGlass,
  "🛵": Motorcycle,
  "🗺": MapTrifold,
  "📝": NotePencil,
  "📞": Phone,
  "📤": UploadSimple,
  "🔗": Link,
  "📷": Camera,
  "📸": Image,
  "🧾": Receipt,
  "🧮": Calculator,
  "🖨️": Printer,
  "🏭": Factory,
  "🔑": Key,
  "🔐": LockKey,
  "🔒": Lock,
  "👑": Crown,
  "📡": Broadcast,
  "🏆": Trophy,
  "🕐": Clock,
  "📭": Tray,
  "🆔": IdentificationCard,
  "👨‍🔧": Wrench,
  "🎬": FilmStrip,
  "📢": Megaphone,
  "📜": FileText,
  "🔬": Microscope,
  "🛡": Shield,
  "💎": Diamond,
  "🍳": CookingPot,
  "🛋": Armchair,
  "🪵": Tree,
  "🧱": Wall,
  "🎟": Tag,
  "🎟️": Tag,
  "🏷️": Tag,
  "🎖️": Medal,
  "⚖️": Scales,
};

/** Transitional adapter: turns legacy content symbols into the new icon set. */
export function IconSymbol({ symbol, size = 22, className = "", filled = false }: IconProps & { symbol: string }) {
  if (symbol === "⭐" || symbol === "💫" || symbol === "✦") return <IconStarsOrbit size={size} className={className} />;
  const Glyph = legacySymbolGlyphs[symbol] || Sparkle;
  return <Glyph aria-hidden="true" focusable="false" size={size} weight={filled ? "fill" : "duotone"} className={`delis-icon ${className}`} />;
}

/** Graphite-exclusive Stars glyph: a faceted core with an orbiting signal. */
export function IconStarsOrbit({ size = 24, className = "" }: IconProps) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 32 32" fill="none" className={`delis-icon graphite-icon graphite-icon--stars ${className}`}>
      <ellipse className="graphite-icon__orbit" cx="16" cy="16" rx="13" ry="6.5" stroke="currentColor" strokeWidth="1.25" strokeDasharray="2.5 2.5" />
      <path className="graphite-icon__core" d="M16 5.2c1.05 5.8 4.1 8.75 10 10.8-5.9 2.05-8.95 5-10 10.8-1.05-5.8-4.1-8.75-10-10.8 5.9-2.05 8.95-5 10-10.8Z" fill="currentColor" />
      <circle className="graphite-icon__satellite" cx="27.2" cy="13.3" r="2" fill="currentColor" />
      <path d="m16 10.2 1.45 4.35 4.35 1.45-4.35 1.45L16 21.8l-1.45-4.35L10.2 16l4.35-1.45L16 10.2Z" fill="var(--graphite-icon-cut, #07100b)" />
    </svg>
  );
}

/** Graphite-exclusive loyalty core used instead of generic crowns and emoji. */
export function IconLoyaltyCore({ size = 24, className = "" }: IconProps) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 32 32" fill="none" className={`delis-icon graphite-icon graphite-icon--core ${className}`}>
      <path className="graphite-icon__hex-outer" d="M16 2.8 27.5 9.4v13.2L16 29.2 4.5 22.6V9.4L16 2.8Z" stroke="currentColor" strokeWidth="1.6" />
      <path className="graphite-icon__hex-inner" d="m16 8 6.9 4v8L16 24l-6.9-4v-8L16 8Z" fill="currentColor" fillOpacity=".18" stroke="currentColor" strokeWidth="1.1" />
      <path className="graphite-icon__pulse" d="m8.2 16 4.2-.05 1.8-3.8 3.25 8.2 2.05-4.4h4.3" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Level-specific faceted signal; colors are inherited from the card accent. */
export function IconTierSignal({ size = 24, className = "", filled = false }: IconProps) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 32 32" fill="none" className={`delis-icon graphite-icon graphite-icon--tier ${filled ? "is-filled" : ""} ${className}`}>
      <path d="M16 2.8 28 16 16 29.2 4 16 16 2.8Z" fill="currentColor" fillOpacity={filled ? ".95" : ".16"} stroke="currentColor" strokeWidth="1.5" />
      <path d="m16 2.8 4.4 13.2L16 29.2 11.6 16 16 2.8ZM4 16h24" stroke="currentColor" strokeWidth="1" strokeOpacity=".65" />
      <circle cx="16" cy="16" r="2.1" fill={filled ? "var(--graphite-icon-cut, #07100b)" : "currentColor"} />
    </svg>
  );
}

// Alias retained for older imports that used “bag” semantically as a basket.
export const IconBasket = icon(Bag, "bag");
