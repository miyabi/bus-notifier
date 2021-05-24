const config = {
  logInFormUrl: 'URL_FOR_LOGGING_IN',
  busStatusPageUrl: 'URL_FOR_FETCHING_BUS_LOCATION',
  busStatusPageRefererUrl: 'URL_USED_AS_REFERER_TO_FETCH_BUS_LOCATION',
  routes: {
    go: { // Morning
      startHour: 0,
      endHour: 9,
      locationsToNotify: {
        '8': { label: '（4つ手前）' },
        '9': { label: '（3つ手前）' },
        '10': { label: '（2つ手前）' },
        '11': { label: '（1つ手前）' },
        '12': { label: '' },
        '16': { label: '' },
      },
      homeLocation: '12',
      lastLocation: '15', // Last location before arriving at the kindergarten
      startingLocation: '0',
      finalLocation: '16',
    },
    'back-early': { // Around noon
      startHour: 10,
      endHour: 13,
      locationsToNotify: {
        '0': { label: '' },
        '5': { label: '（3つ手前）' },
        '6': { label: '（2つ手前）' },
        '7': { label: '（1つ手前）' },
        '8': { label: '' },
      },
      homeLocation: '8',
      lastLocation: '11', // Last location before arriving at the kindergarten
      startingLocation: '0',
      finalLocation: '12',
    },
    back: { // Afternoon
      startHour: 14,
      endHour: 23,
      locationsToNotify: {
        '0': { label: '' },
        '5': { label: '（3つ手前）' },
        '6': { label: '（2つ手前）' },
        '7': { label: '（1つ手前）' },
        '8': { label: '' },
      },
      homeLocation: '8',
      lastLocation: '11', // Last location before arriving at the kindergarten
      startingLocation: '0',
      finalLocation: '12',
    },
  },
  notificationTargetHours: [ // Hours to fetch the content of the bus status page every minute
    { start: { hour: 8, minute: 15 }, end: { hour: 8, minute: 45 } },
    { start: { hour: 11, minute: 45 }, end: { hour: 12, minute: 15 } },
    { start: { hour: 14, minute: 45 }, end: { hour: 15, minute: 15 } },
  ],
  finalLocationDistance: 100, // To be used to check if the bus has arrived at the kindergarten
  messageFormats: {
    notify: {
      prefix: 'バスが',
      suffix: 'まで来ました！',
      suffixForHomeLocation: 'に到着しました！',
      messageForStartingLocation: 'バスが園を出発しました！',
      messageForFinalLocation: 'バスが園に到着しました！',
    },
    reply: {
      prefix: 'バスは',
      suffix: 'を通過しました。',
      suffixForHomeLocation: 'を通過しました。',
      messageForStartingLocation: 'バスは園を出発しています。',
      messageForFinalLocation: 'バスは園に到着しています。',
    },
  },
  estimatedMinuitesRemainingToArrivePrefix: '（到着予想: およそ',
  estimatedMinuitesRemainingToArriveSuffix: '分後）',
  outOfServiceHoursMessage: 'バスは現在運行していません。',
  usageMessage: '登園、降園ともに3つ前のバス停の通過から通知します（午前保育にも対応）。また「バスどこ」と送ると、すぐに現在の場所を返信します。',
  lineMessageApiReplyUrl: 'https://api.line.me/v2/bot/message/reply',
  lineMessageApiPushUrl: 'https://api.line.me/v2/bot/message/push',
  holidayCalendarId: 'ja.japanese#holiday@group.v.calendar.google.com',
  propertyKeys: {
    cookies: 'cookies',
    busStatus: 'busStatus',
    groupId: 'groupId',
  },
}
