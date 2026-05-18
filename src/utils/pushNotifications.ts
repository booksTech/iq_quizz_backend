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

function messagePreview(message) {
  if (message.text) return message.text;
  if (message.emoji) return message.emoji;
  if (message.attachments?.length) return 'Sent an attachment';
  if (message.gifUrl) return 'Sent a GIF';
  if (message.location) return 'Shared a location';
  return 'Sent a message';
}

async function sendExpoNotifications(notifications) {
  const validNotifications = notifications.filter((notification) => isExpoPushToken(notification.to));
  if (!validNotifications.length) return;

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

      if (!response.ok) {
        const body = await response.text();
        console.error('Expo push send failed:', response.status, body);
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

    if (!pushTokens.length) return;

    const title = room.room_code ? `Room ${room.room_code}` : 'New message';
    const notifications = pushTokens.map(({ token }) => ({
      to: token,
      sound: 'default',
      title,
      body: `${message.senderEmail}: ${messagePreview(message)}`,
      channelId: 'messages',
      data: {
        type: 'message',
        roomId: message.roomId,
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
