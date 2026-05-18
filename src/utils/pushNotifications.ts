const { ChatRoom, PushToken } = require('../db/database');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const isExpoPushToken = (token) => /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);

const chunk = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

async function sendExpoNotifications(notifications) {
  const validNotifications = notifications.filter((notification) => isExpoPushToken(notification.to));
  if (!validNotifications.length) {
    console.log('Expo push skipped: no valid Expo push tokens.');
    return;
  }

  for (const notificationChunk of chunk(validNotifications, 100)) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notificationChunk),
      });
      const body = await response.json().catch(async () => ({
        raw: await response.text().catch(() => ''),
      }));

      if (!response.ok) {
        console.error('Expo push send failed:', response.status, body);
        continue;
      }

      const tickets = Array.isArray(body?.data) ? body.data : [];
      tickets.forEach((ticket, index) => {
        if (ticket?.status === 'error') {
          console.error('Expo push ticket error:', {
            tokenPrefix: notificationChunk[index]?.to?.slice(0, 22),
            message: ticket.message,
            details: ticket.details,
          });
        }
      });

      const inactiveTokens = tickets
        .map((ticket, index) => (
          ticket?.details?.error === 'DeviceNotRegistered'
            ? notificationChunk[index]?.to
            : ''
        ))
        .filter(Boolean);

      if (inactiveTokens.length) {
        await PushToken.updateMany(
          { token: { $in: inactiveTokens } },
          { is_active: false, updated_at: new Date() }
        );
        console.log(`Expo push deactivated ${inactiveTokens.length} unregistered token(s).`);
      }
    } catch (error) {
      console.error('Expo push send error:', error);
    }
  }
}

async function notifyRoomMessage(message) {
  try {
    const room = await ChatRoom.findById(message.roomId);
    if (!room?.participant_ids?.length) return;

    const recipientIds = room.participant_ids.filter((userId) => userId !== message.senderId);
    if (!recipientIds.length) return;

    const pushTokens = await PushToken.find({
      user_id: { $in: recipientIds },
      is_active: true,
    }).select('token');

    if (!pushTokens.length) {
      console.log('Message push skipped: no active push tokens for recipients.', {
        roomId: message.roomId,
        recipientCount: recipientIds.length,
      });
      return;
    }

    const title = room.room_code ? `Room ${room.room_code}` : 'New message';
    const notifications = pushTokens.map(({ token }) => ({
      to: token,
      sound: 'default',
      priority: 'high',
      title,
      body: 'please take a quizz',
      channelId: 'messages',
      data: {
        type: 'message',
      },
    }));

    await sendExpoNotifications(notifications);
  } catch (error) {
    console.error('Message push notification error:', error);
  }
}

module.exports = {
  notifyRoomMessage,
  sendExpoNotifications,
};
