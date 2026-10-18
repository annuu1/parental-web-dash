export async function sendTelegramNotification(
  token: string,
  chatId: string,
  text: string
): Promise<boolean> {
  if (!token || !chatId || !text) return false;
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('Failed to send Telegram notification:', err);
    return false;
  }
}
