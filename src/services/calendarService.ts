/**
 * Calendar Service: Connects meeting schedules to Google Calendar & Apple Calendar (iCal)
 * Provides automatic recurring reminders for the youth meeting (Every Friday 7:00 PM).
 */

export interface CalendarEventDetails {
  title?: string;
  description?: string;
  location?: string;
  startHour?: number; // 24-hr format, defaults to 19 (7:00 PM)
  startMinute?: number;
  durationMinutes?: number; // defaults to 120 (2 hours, ends 9:00 PM)
}

/**
 * Returns the Date object of the next Friday at 19:00:00 (7:00 PM)
 */
export function getNextFridayDate(hour = 19, minute = 0): Date {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
  
  let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
  
  // If today is Friday but past meeting time (e.g. after 21:00), schedule for next Friday
  if (daysUntilFriday === 0) {
    const currentHour = now.getHours();
    if (currentHour >= 21) {
      daysUntilFriday = 7;
    }
  }

  const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilFriday, hour, minute, 0, 0);
  return targetDate;
}

function formatDateToIcsString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  const secs = pad(d.getSeconds());
  return `${year}${month}${day}T${hours}${mins}${secs}`;
}

/**
 * Generates a direct Google Calendar Web Link with weekly Friday recurrence & details
 */
export function getGoogleCalendarMeetingUrl(details?: CalendarEventDetails): string {
  const title = details?.title || 'اجتماع الثلاثة فتية للشباب 🕊️';
  const description = details?.description || 'موعد اجتماع الثلاثة فتية للشباب الأسبوعي كل يوم جمعة الساعة 7:00 مساءً. منتظرينك بحب وفرح! 🕊️✨\n(تذكير تلقائي عبر منصة الاجتماع)';
  const location = details?.location || 'مقر اجتماع الثلاثة فتية للشباب';
  
  const startHour = details?.startHour ?? 19;
  const startMinute = details?.startMinute ?? 0;
  const durationMinutes = details?.durationMinutes ?? 120;

  const startDate = getNextFridayDate(startHour, startMinute);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  const startStr = formatDateToIcsString(startDate);
  const endStr = formatDateToIcsString(endDate);

  const baseUrl = 'https://calendar.google.com/calendar/render';
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${startStr}/${endStr}`,
    details: description,
    location: location,
    recur: 'RRULE:FREQ=WEEKLY;BYDAY=FR'
  });

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Generates a standard .ics string for Apple Calendar (iOS, iPadOS, macOS, Outlook)
 * Includes recurring weekly Friday rule and 2 automated alarm alerts (2 hours before and 30 mins before)
 */
export function generateAppleCalendarIcs(details?: CalendarEventDetails): string {
  const title = details?.title || 'اجتماع الثلاثة فتية للشباب 🕊️';
  const description = details?.description || 'موعد اجتماع الثلاثة فتية للشباب الأسبوعي كل يوم جمعة الساعة 7:00 مساءً. منتظرينك بحب وفرح! 🕊️✨';
  const location = details?.location || 'مقر اجتماع الثلاثة فتية للشباب';

  const startHour = details?.startHour ?? 19;
  const startMinute = details?.startMinute ?? 0;
  const durationMinutes = details?.durationMinutes ?? 120;

  const startDate = getNextFridayDate(startHour, startMinute);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  const startStr = formatDateToIcsString(startDate);
  const endStr = formatDateToIcsString(endDate);
  const stampStr = formatDateToIcsString(new Date());

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Three Youths Community//Meeting Calendar//AR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:اجتماع الثلاثة فتية للشباب 🕊️',
    'X-WR-TIMEZONE:Africa/Cairo',
    'BEGIN:VEVENT',
    `UID:meeting-three-youths-${startDate.getTime()}@threeyouths.org`,
    `DTSTAMP:${stampStr}`,
    `DTSTART:${startStr}`,
    `DTEND:${endStr}`,
    'RRULE:FREQ=WEEKLY;BYDAY=FR',
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    'STATUS:CONFIRMED',
    // Reminder 1: 2 hours before meeting (5:00 PM)
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    'DESCRIPTION:تذكير: موعد اجتماع الثلاثة فتية للشباب الليلة الساعة 7:00 م (بعد ساعتين) 🕊️',
    'END:VALARM',
    // Reminder 2: 30 minutes before meeting (6:30 PM)
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:تذكير: موعد اجتماع الثلاثة فتية للشباب يبدأ بعد نصف ساعة! منتظرينك ❤️',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  return icsLines.join('\r\n');
}

/**
 * Downloads or triggers Apple Calendar (.ics) file directly on iOS / Android / Desktop
 */
export function downloadAppleCalendarIcs(details?: CalendarEventDetails): void {
  const icsContent = generateAppleCalendarIcs(details);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'three-youths-meeting.ics');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
