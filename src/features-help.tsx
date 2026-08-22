/**
 * DELIS — Сервисная помощь: перевод статусов заказа и уведомление клиента в боте.
 */
import type { Lang } from "./i18n";

export function translateStatusMessage(lang: Lang, key: string): string {
  const messages: Record<Lang, Record<string, string>> = {
    uz: {
      "order.accepted": "Buyurtma qabul qilindi! Menejer 15 daqiqada tasdiqlaydi.",
      "order.preparing": "Zavodda yig'ilmoqda va qadoqlanmoqda.",
      "order.shipped": "Buyurtma kuryerga topshirildi, yo'lda!",
      "order.delivered": "Buyurtma yetkazildi. Muazzam!",
    },
    ru: {
      "order.accepted": "Заказ принят! Менеджер подтвердит за 15 минут.",
      "order.preparing": "Собирается и упаковывается на заводе.",
      "order.shipped": "Заказ передан курьеру, в пути!",
      "order.delivered": "Заказ успешно доставлен. Отлично!",
    },
    en: {
      "order.accepted": "Order accepted! Manager will confirm in 15 min.",
      "order.preparing": "Being prepared and packaged at the factory.",
      "order.shipped": "Order handed to the courier, on the way!",
      "order.delivered": "Order successfully delivered. Awesome!",
    },
  };
  return messages[lang][key] ?? key;
}

export function notifyCustomerInBot(
  orderId: string,
  status: "new" | "preparing" | "shipped" | "delivered",
  lang: Lang,
  userTgId?: number,
) {
  // Uncomment for real bot integration:
  // The bot will send status updates to the user.
  const msg = translateStatusMessage(lang, `order.${status}`);
  console.log(`[BOT] ${msg} → order ${orderId}${userTgId ? ` → tg ${userTgId}` : ""}`);
  // sendDataToBot({
  //   type: "delis_status_update",
  //   order_id: orderId,
  //   new_status: status,
  //   customer_tg_id: userTgId,
  // });
}
