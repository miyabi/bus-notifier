/* Property structure
{
  cookies: string,
  busStatus: {
    [routeId: string]: {
      date: string,
      prevLocation: string,
      avgArrivalTime: { [location: string]: number },
      arrived: boolean,
    },
  },
  groupId: string,
}
*/

function main() {
  // Check the bus location and notify
  const now = new Date()
  if (!needsToCheck(now)) {
    return
  }

  const routeId = getRouteId(now)
  const busStatus = loadBusStatus()

  const prevLocation = (busStatus[routeId] || {}).prevLocation
  const currentLocation = fetchBusLocation(routeId)
  if (currentLocation === prevLocation) {
    Logger.log(['Location not changed.', busStatus])
    return
  }

  const newBusStatus = updateBusStatus(busStatus, routeId, currentLocation, now)
  saveBusStatus(newBusStatus)

  if (!config.routes[routeId].locationsToNotify[currentLocation]) {
    Logger.log(['No need to notify.', newBusStatus])
    return
  }

  const groupId = getGroupId()
  if (groupId) {
    const minutes = getEstimatedMinuitesRemainingToArrive(busStatus, routeId, currentLocation, now)
    const message = formatMessage('notify', routeId, currentLocation, minutes)
    requestLineApi(config.lineMessageApiPushUrl, { to: groupId, messages: [{ type: 'text', text: message }] })
    Logger.log(['Notified', message])
  } else {
    Logger.log('Not able to notify.')
  }
}

function doPost(e) {
  // Reply
  const data = JSON.parse(e.postData.contents)
  const event = data.events[0]
  const { message, replyToken } = event

  if (message.type === 'text') {
    if (message.text.match(/ヘルプ/)) {
      // Send usage
      requestLineApi(config.lineMessageApiReplyUrl, { replyToken, messages: [{ type: 'text', text: config.usageMessage }] })
      return
    }

    if (message.text.match(/バスどこ/)) {
      // Check the bus location and reply
      checkNowAndReply(replyToken)
    }
  }

  if (event.source.type === 'group') {
    saveGroupId(event.source.groupId)
  }
}

function checkNowAndReply(replyToken) {
  const now = new Date()
  const routeId = getRouteId(now)
  const busStatus = loadBusStatus()

  const prevLocation = (busStatus[routeId] || {}).prevLocation
  const currentLocation = fetchBusLocation(routeId)

  if (currentLocation !== prevLocation) {
    const newBusStatus = updateBusStatus(busStatus, routeId, currentLocation, now)
    saveBusStatus(newBusStatus)
  }

  let message = ''
  if (currentLocation === config.routes[routeId].finalLocation) {
    message = config.outOfServiceHoursMessage
  } else {
    const minutes = getEstimatedMinuitesRemainingToArrive(busStatus, routeId, undefined, now)
    message = formatMessage('reply', routeId, currentLocation, minutes)
  }

  if (replyToken) {
    requestLineApi(config.lineMessageApiReplyUrl, { replyToken, messages: [{ type: 'text', text: message }] })
    Logger.log(['Replied', message])
  }
}

function formatMessage(type, routeId, location, estimatedMinuitesRemainingToArrive) {
  const route = config.routes[routeId]
  const messageFormat = config.messageFormats[type]

  if (location === route.finalLocation) {
    return messageFormat.messageForFinalLocation
  }

  let message = ''
  if (location === route.startingLocation) {
    message = messageFormat.messageForStartingLocation
  } else {
    const label = (route.locationsToNotify[location] || {}).label || ''
    const prefix = messageFormat.prefix
    const suffix = location === route.homeLocation
      ? messageFormat.suffixForHomeLocation
      : messageFormat.suffix

    message = `${prefix} ${location} ${label}${suffix}`
  }

  if (estimatedMinuitesRemainingToArrive) {
    // Add estimated minutes remaining to the message
    message = `${message}\n${config.estimatedMinuitesRemainingToArrivePrefix} ${estimatedMinuitesRemainingToArrive} ${config.estimatedMinuitesRemainingToArriveSuffix}`
  }

  return message
}

function updateBusStatus(busStatus, routeId, location, date) {
  const route = config.routes[routeId]
  const prevStatus = busStatus[routeId] || {}

  // Calculate average arrival time simply
  const arrivalTime = getTimeValue(date)
  const prevArrivalTime = getAverageArrivalTime(busStatus, routeId, location) || arrivalTime
  const avgArrivalTime = Math.round((prevArrivalTime + arrivalTime) / 2)

  const newDate = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
  const prevDate = prevStatus.date
  const arrived = newDate === prevDate && (location === route.homeLocation || prevStatus.arrived)

  return {
    ...busStatus,
    [routeId]: {
      date: newDate,
      prevLocation: location,
      avgArrivalTime: { ...prevStatus.avgArrivalTime, [location]: avgArrivalTime },
      arrived,
    },
  }
}

function getEstimatedMinuitesRemainingToArrive(busStatus, routeId, location, date) {
  if (!(busStatus[routeId] || {}).arrived || true) {
    // Calculate estimated arrival time
    const currentTime = getTimeValue(date)
    const locationAvgArrivalTime = location ? getAverageArrivalTime(busStatus, routeId, location) : currentTime
    const diff = currentTime - locationAvgArrivalTime
    const homeAvgArrivalTime = getAverageArrivalTime(busStatus, routeId, config.routes[routeId].homeLocation)
    const estimatedArrivalTime = homeAvgArrivalTime && (homeAvgArrivalTime + diff)
    if (estimatedArrivalTime && estimatedArrivalTime > currentTime) {
      return Math.round((estimatedArrivalTime - currentTime) / 60)
    }
  }

  return undefined
}

function getAverageArrivalTime(busStatus, routeId, location) {
  const status = busStatus[routeId] || {}
  return status.avgArrivalTime && status.avgArrivalTime[location]
}

function getTimeValue(date) {
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()
  return ((hour * 60) + minute) * 60 + second
}

function getRouteId(date) {
  // Returns route id for specified date
  const hour = date.getHours()
  return Object.keys(config.routes).find(key => (
    hour >= config.routes[key].startHour && hour <= config.routes[key].endHour
  )) || 'back'
}

function needsToCheck(date) {
  const day = date.getDay()
  if (day === 0 || day === 6) {
    Logger.log(['No need to check: Weekend', date])
    return false
  }

  if (isHoliday(date)) {
    Logger.log(['No need to check: Holiday', date])
    return false
  }

  const hour = date.getHours()
  const minute = date.getMinutes()

  const isInTargetHours = !!config.notificationTargetHours.find(({ start, end }) => (
    ((hour === start.hour && minute >= start.minute) || (hour > start.hour))
    && ((hour === end.hour && minute <= end.minute) || (hour < end.hour))
  ))

  if (!isInTargetHours) {
    Logger.log(['No need to check: Out of hours', date])
    return false
  }

  return true
}

function isHoliday(date) {
  const calendar = CalendarApp.getCalendarById(config.holidayCalendarId)
  if (calendar) {
    const holidays = calendar.getEventsForDay(date)
    return holidays.length >= 1
  }
  return false
}

function fetchBusLocation(routeId) {
  // Log in if neccessary and fetch the bus location from the website
  const cookies = loadCookies()
  let location = false

  if (cookies) {
    const result = fetchBusStatusPageContent(routeId, cookies)
    location = getBusLocation(routeId, result.content)
  }

  if (location === false) {
    // Session has expired, it needs to log in
    Logger.log('Session has expired.')
    const logInResult = logIn()
    // Save session
    saveCookies(logInResult.cookies)

    const result = fetchBusStatusPageContent(routeId, logInResult.cookies)
    location = getBusLocation(routeId, result.content)
  }

  return location
}

function getBusLocation(routeId, content) {
  // Parse the bus status page to get the bus location
  let data = {}
  let html = ''
  try {
    data = JSON.parse(content) || {}
    html = (data.view && data.view['HTMLBusStopList']) || ''
    if (html === '') {
      // Session has expired
      return false
    }
  } catch (e) {
    // Session has expired
    Logger.log(e)
    return false
  }

  // Find marker
  const matches = html.match(/^.*<th class='aka(_start)?'><img src='.+?\/bosbus_\.png' \/><\/th>\s*<td>([^<]+)<\/td>.*$/s)
  if (matches) {
    const route = config.routes[routeId]
    let location = matches[1] ? route.startingLocation : matches[2]
    if (location === route.lastLocation) {
      // Check if the bus has arrived at the final location
      const positions = data.arrSetNowBusRoot[secrets.courseId]
      if (Array.isArray(positions) && positions.length >= 2) {
        const finalLocationPosition = data.csuser.position
        const lastPosition = positions[positions.length - 1]
        const d = calculateDistance(
          parseFloat(finalLocationPosition[0]),
          parseFloat(finalLocationPosition[1]),
          parseFloat(lastPosition.latitude),
          parseFloat(lastPosition.longitude),
        )
        if (d <= config.finalLocationDistance) {
          location = route.finalLocation
        }
        Logger.log(`Check if the bus has arrived at the final location: distasnce=${d}`)
      }
    }

    Logger.log(`Location found: ${location}`)
    return location
  }
  return undefined
}

function calculateDistance(lat1, long1, lat2, long2) {
  // Calculate distance from latitude and longitude
  const rx = 6378137
  const ry = 6356752

  const dy = Math.abs(lat1 - lat2) / 180 * Math.PI
  const dx1 = Math.abs(long1 - long2)
  const dx2 = Math.abs(long1 + long2)
  const dx = (dx1 <= 180 ? dx1 : dx2) / 180 * Math.PI
  const p = (lat1 + lat2) / 2 / 180 * Math.PI
  const e = Math.sqrt((rx ** 2 - ry ** 2) / (rx ** 2))
  const w = Math.sqrt(1 - (e ** 2) * (Math.sin(p) ** 2))
  const m = rx * (1 - e ** 2) / (w ** 3)
  const n = rx / w

  const d = Math.sqrt((dy * m) ** 2 + (dx * n * Math.cos(p)) ** 2)
  return d
}

function fetchBusStatusPageContent(routeId, cookies) {
  // Fetch the content of the bus status page to get the bus location
  const type = routeId === 'go' ? '1' : '2'
  const referer = config.busStatusPageRefererUrl && `${config.busStatusPageRefererUrl}?courseid=${secrets.courseId}&type=${type}`

  return request(config.busStatusPageUrl, {
    method: 'post',
    payload: {
      course_id: secrets.courseId,
      type,
    },
  }, cookies, referer)
}

function logIn() {
  // Log in
  const { url, content, cookies } = request(config.logInFormUrl, {
    method: 'post',
    payload: secrets.logInCredentials,
  })

  // Access the bus home page to accept cookies to keep the session
  const busHomePageUrl = normalizeUrl(url, getBusHomePageUrl(content))
  return request(busHomePageUrl, {}, cookies, url)
}

function getBusHomePageUrl(content) {
  // Parse home content to get the bus home page url
  return content.replace(/^.*<a href="(\/navi\/busnavi\/terminal\.php\?.*?act=busSituation[^"]+)".*$/s, '$1')
}

function request(url, params, cookies = undefined, referer = undefined) {
  const headers = { ...params.headers }
  if (cookies) {
    headers.Cookie = organizeCookies(cookies)
  }
  if (referer) {
    headers.Referer = referer
  }

  const response = UrlFetchApp.fetch(url, {
    ...params,
    headers,
    followRedirects: false,
  })

  const code = response.getResponseCode()
  const responseHeaders = response.getAllHeaders()
  const newCookies = updateCookies(cookies || {}, parseCookies(responseHeaders['Set-Cookie']))
  
  if (code === 301 ||code === 302) {
    // Redirect
    const destUrl = normalizeUrl(url, responseHeaders['Location'])
    Logger.log(`Redirect to ${destUrl}`)
    return request(destUrl, {}, newCookies, referer)
  }
 
  return {
    url,
    content: response.getContentText(),
    cookies: newCookies,
  }
}

function normalizeUrl(baseUrl, url) {
  // Convert relative url to absolute url
  if (url.match(/^https?:\/\//)) {
    return url
  }

  if (url.indexOf('/') === 0) {
    return baseUrl.replace(/^(https?:\/\/[^\/]+).*$/, '$1') + url
  }

  return baseUrl.replace(/[^\/]+$/, '') + url
}

function parseCookies(cookies) {
  return (
    Array.isArray(cookies)
      ? cookies
      : [cookies]
  )
    .map(cookie => cookie.replace(/^([^;]+).*$/, '$1'))
    .reduce((accumulator, cookie) => {
      [key, value] = cookie.split('=', 2)
      accumulator[key] = value
      return accumulator
    }, {})
}

function updateCookies(cookies, newCookies) {
  return { ...cookies, ...newCookies }
}

function organizeCookies(cookies = {}) {
  return Object.keys(cookies)
    .map(key => `${key}=${cookies[key]}`)
    .join(';')
}

function getProperties() {
  return PropertiesService.getScriptProperties()
}

function resetProperties() {
  getProperties().deleteAllProperties()
  Logger.log('Properties have been reset.')
}

function loadCookies() {
  return JSON.parse(getProperties().getProperty(config.propertyKeys.cookies) || '{}')
}

function saveCookies(cookies) {
  getProperties().setProperty(config.propertyKeys.cookies, JSON.stringify(cookies))
}

function loadBusStatus() {
  return JSON.parse(getProperties().getProperty(config.propertyKeys.busStatus) || '{}')
}

function saveBusStatus(busStatus) {
  getProperties().setProperty(config.propertyKeys.busStatus, JSON.stringify(busStatus))
}

function getGroupId() {
  return getProperties().getProperty(config.propertyKeys.groupId)
}

function saveGroupId(groupId) {
  getProperties().setProperty(config.propertyKeys.groupId, groupId)
}

function requestLineApi(url, payload) {
  UrlFetchApp.fetch(url, {
    headers: {
      Authorization: `Bearer ${secrets.lineMessageApiToken}`,
      'Content-Type': 'application/json',
    },
    method: 'post',
    payload: JSON.stringify(payload),
  })
}
