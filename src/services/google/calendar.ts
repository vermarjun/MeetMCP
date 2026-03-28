import { google, calendar_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  meetLink?: string;
  attendees: string[];
  description?: string;
}

export class CalendarService {
  private calendar: calendar_v3.Calendar;

  constructor(auth: OAuth2Client) {
    this.calendar = google.calendar({ version: "v3", auth });
  }

  async getUpcomingEvents(
    maxResults: number = 10,
    hoursAhead: number = 24
  ): Promise<CalendarEvent[]> {
    const now = new Date();
    const future = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    const res = await this.calendar.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: "startTime",
    });

    return (res.data.items ?? []).map(this.parseEvent);
  }

  async getEvent(eventId: string): Promise<CalendarEvent | null> {
    try {
      const res = await this.calendar.events.get({
        calendarId: "primary",
        eventId,
      });
      return this.parseEvent(res.data);
    } catch {
      return null;
    }
  }

  private parseEvent(event: calendar_v3.Schema$Event): CalendarEvent {
    const meetLink =
      event.hangoutLink ??
      event.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video")?.uri;

    return {
      id: event.id ?? "",
      title: event.summary ?? "(No title)",
      startTime: event.start?.dateTime ?? event.start?.date ?? "",
      endTime: event.end?.dateTime ?? event.end?.date ?? "",
      meetLink,
      attendees: (event.attendees ?? [])
        .map((a) => a.email ?? "")
        .filter(Boolean),
      description: event.description ?? undefined,
    };
  }
}
