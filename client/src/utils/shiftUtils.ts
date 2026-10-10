export interface ShiftScheduleItem {
  id: string;
  name: string;
  code: string;
  startTime: string; // "06:00"
  endTime: string;   // "14:00"
  days?: string[];
  active?: boolean;
  enabled?: boolean;
}

/**
 * Calculates currently active shift from real shift records and current local or server time.
 * Handles normal daytime shifts (e.g. 06:00 - 14:00), overnight shifts (e.g. 22:00 - 06:00),
 * day-of-week constraints, and active/enabled states.
 */
export function determineActiveShift(
  shifts: ShiftScheduleItem[],
  atDate: Date = new Date(),
  timezone?: string
): ShiftScheduleItem | null {
  if (!Array.isArray(shifts) || shifts.length === 0) return null;

  let timeParts: { hour: number; minute: number };
  let currentDay: string;

  const tz = timezone || 'Asia/Kolkata';

  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz,
    });
    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone: tz,
    });
    const parts = formatter.formatToParts(atDate);
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    timeParts = { hour, minute };
    currentDay = dayFormatter.format(atDate);
  } catch (_) {
    timeParts = { hour: atDate.getHours(), minute: atDate.getMinutes() };
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    currentDay = days[atDate.getDay()];
  }

  const currentMinutes = timeParts.hour * 60 + timeParts.minute;

  // Filter shifts that are enabled and active
  const activeCandidates = shifts.filter((s) => s.active !== false && s.enabled !== false);

  // Prioritize specific shifts (Shift A, Shift B, Shift C) over broad general shifts if overlapping
  const sorted = [...activeCandidates].sort((a, b) => {
    const aIsGen = (a.code || '').toUpperCase().includes('GEN');
    const bIsGen = (b.code || '').toUpperCase().includes('GEN');
    if (aIsGen && !bIsGen) return 1;
    if (!aIsGen && bIsGen) return -1;
    return 0;
  });

  for (const shift of sorted) {
    if (!shift.startTime || !shift.endTime) continue;

    // Check day of week if specified
    if (Array.isArray(shift.days) && shift.days.length > 0) {
      const matchesDay = shift.days.some((d) => d.toLowerCase() === currentDay.toLowerCase());
      if (!matchesDay) continue;
    }

    const [startH, startM] = shift.startTime.split(':').map((v) => parseInt(v, 10));
    const [endH, endM] = shift.endTime.split(':').map((v) => parseInt(v, 10));
    const startMinutes = startH * 60 + (startM || 0);
    const endMinutes = endH * 60 + (endM || 0);

    if (startMinutes < endMinutes) {
      // Normal daytime shift (e.g. 06:00 to 14:00)
      if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
        return shift;
      }
    } else if (startMinutes > endMinutes) {
      // Overnight shift crossing midnight (e.g. 22:00 to 06:00)
      if (currentMinutes >= startMinutes || currentMinutes < endMinutes) {
        return shift;
      }
    } else {
      // 24-hour shift
      return shift;
    }
  }

  return null;
}
