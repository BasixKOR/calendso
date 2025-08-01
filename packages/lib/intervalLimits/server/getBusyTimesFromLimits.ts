import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import { getCheckBookingLimitsService } from "@calcom/lib/di/containers/booking-limits";
import { getStartEndDateforLimitCheck } from "@calcom/lib/getBusyTimes";
import type { EventType } from "@calcom/lib/getUserAvailability";
import { getPeriodStartDatesBetween } from "@calcom/lib/getUserAvailability";
import { withReporting } from "@calcom/lib/sentryWrapper";
import { performance } from "@calcom/lib/server/perfObserver";
import { getTotalBookingDuration } from "@calcom/lib/server/queries/booking";
import { BookingRepository } from "@calcom/lib/server/repository/booking";
import prisma from "@calcom/prisma";
import type { EventBusyDetails } from "@calcom/types/Calendar";

import { descendingLimitKeys, intervalLimitKeyToUnit } from "../intervalLimit";
import type { IntervalLimit } from "../intervalLimitSchema";
import LimitManager from "../limitManager";
import { isBookingWithinPeriod } from "../utils";

const _getBusyTimesFromLimits = async (
  bookingLimits: IntervalLimit | null,
  durationLimits: IntervalLimit | null,
  dateFrom: Dayjs,
  dateTo: Dayjs,
  duration: number | undefined,
  eventType: NonNullable<EventType>,
  bookings: EventBusyDetails[],
  timeZone: string,
  rescheduleUid?: string
) => {
  performance.mark("limitsStart");

  // shared amongst limiters to prevent processing known busy periods
  const limitManager = new LimitManager();

  // run this first, as counting bookings should always run faster..
  if (bookingLimits) {
    performance.mark("bookingLimitsStart");
    await getBusyTimesFromBookingLimits({
      bookings,
      bookingLimits,
      dateFrom,
      dateTo,
      eventTypeId: eventType.id,
      limitManager,
      rescheduleUid,
      timeZone,
    });
    performance.mark("bookingLimitsEnd");
    performance.measure(`checking booking limits took $1'`, "bookingLimitsStart", "bookingLimitsEnd");
  }

  // ..than adding up durations (especially for the whole year)
  if (durationLimits) {
    performance.mark("durationLimitsStart");
    await getBusyTimesFromDurationLimits(
      bookings,
      durationLimits,
      dateFrom,
      dateTo,
      duration,
      eventType,
      limitManager,
      timeZone,
      rescheduleUid
    );
    performance.mark("durationLimitsEnd");
    performance.measure(`checking duration limits took $1'`, "durationLimitsStart", "durationLimitsEnd");
  }

  performance.mark("limitsEnd");
  performance.measure(`checking all limits took $1'`, "limitsStart", "limitsEnd");

  return limitManager.getBusyTimes();
};

const _getBusyTimesFromBookingLimits = async (params: {
  bookings: EventBusyDetails[];
  bookingLimits: IntervalLimit;
  dateFrom: Dayjs;
  dateTo: Dayjs;
  limitManager: LimitManager;
  rescheduleUid?: string;
  eventTypeId?: number;
  teamId?: number;
  user?: { id: number; email: string };
  includeManagedEvents?: boolean;
  timeZone?: string | null;
}) => {
  const {
    bookings,
    bookingLimits,
    dateFrom,
    dateTo,
    limitManager,
    eventTypeId,
    teamId,
    user,
    rescheduleUid,
    includeManagedEvents = false,
    timeZone,
  } = params;

  for (const key of descendingLimitKeys) {
    const limit = bookingLimits?.[key];
    if (!limit) continue;

    const unit = intervalLimitKeyToUnit(key);
    const periodStartDates = getPeriodStartDatesBetween(dateFrom, dateTo, unit);

    for (const periodStart of periodStartDates) {
      if (limitManager.isAlreadyBusy(periodStart, unit)) continue;

      // special handling of yearly limits to improve performance
      if (unit === "year") {
        try {
          const checkBookingLimitsService = getCheckBookingLimitsService();
          await checkBookingLimitsService.checkBookingLimit({
            eventStartDate: periodStart.toDate(),
            limitingNumber: limit,
            eventId: eventTypeId,
            key,
            teamId,
            user,
            rescheduleUid,
            includeManagedEvents,
            timeZone,
          });
        } catch (_) {
          limitManager.addBusyTime(periodStart, unit);
          if (periodStartDates.every((start) => limitManager.isAlreadyBusy(start, unit))) {
            return;
          }
        }
        continue;
      }

      const periodEnd = periodStart.endOf(unit);
      let totalBookings = 0;

      for (const booking of bookings) {
        // consider booking part of period independent of end date
        if (!isBookingWithinPeriod(booking, periodStart, periodEnd, timeZone || "UTC")) {
          continue;
        }
        totalBookings++;
        if (totalBookings >= limit) {
          limitManager.addBusyTime(periodStart, unit);
          break;
        }
      }
    }
  }
};
const _getBusyTimesFromDurationLimits = async (
  bookings: EventBusyDetails[],
  durationLimits: IntervalLimit,
  dateFrom: Dayjs,
  dateTo: Dayjs,
  duration: number | undefined,
  eventType: NonNullable<EventType>,
  limitManager: LimitManager,
  timeZone: string,
  rescheduleUid?: string
) => {
  for (const key of descendingLimitKeys) {
    const limit = durationLimits?.[key];
    if (!limit) continue;

    const unit = intervalLimitKeyToUnit(key);
    const periodStartDates = getPeriodStartDatesBetween(dateFrom, dateTo, unit);

    for (const periodStart of periodStartDates) {
      if (limitManager.isAlreadyBusy(periodStart, unit)) continue;

      const selectedDuration = (duration || eventType.length) ?? 0;

      if (selectedDuration > limit) {
        limitManager.addBusyTime(periodStart, unit);
        continue;
      }

      // special handling of yearly limits to improve performance
      if (unit === "year") {
        const totalYearlyDuration = await getTotalBookingDuration({
          eventId: eventType.id,
          startDate: periodStart.toDate(),
          endDate: periodStart.endOf(unit).toDate(),
          rescheduleUid,
        });
        if (totalYearlyDuration + selectedDuration > limit) {
          limitManager.addBusyTime(periodStart, unit);
          if (periodStartDates.every((start) => limitManager.isAlreadyBusy(start, unit))) {
            return;
          }
        }
        continue;
      }

      const periodEnd = periodStart.endOf(unit);
      let totalDuration = selectedDuration;

      for (const booking of bookings) {
        // consider booking part of period independent of end date
        if (!isBookingWithinPeriod(booking, periodStart, periodEnd, timeZone || "UTC")) {
          continue;
        }
        totalDuration += dayjs(booking.end).diff(dayjs(booking.start), "minute");
        if (totalDuration > limit) {
          limitManager.addBusyTime(periodStart, unit);
          break;
        }
      }
    }
  }
};

const getBusyTimesFromDurationLimits = withReporting(
  _getBusyTimesFromDurationLimits,
  "getBusyTimesFromDurationLimits"
);

const _getBusyTimesFromTeamLimits = async (
  user: { id: number; email: string },
  bookingLimits: IntervalLimit,
  dateFrom: Dayjs,
  dateTo: Dayjs,
  teamId: number,
  includeManagedEvents: boolean,
  timeZone: string,
  rescheduleUid?: string
) => {
  const { limitDateFrom, limitDateTo } = getStartEndDateforLimitCheck(
    dateFrom.toISOString(),
    dateTo.toISOString(),
    bookingLimits
  );

  const bookingRepo = new BookingRepository(prisma);
  const bookings = await bookingRepo.getAllAcceptedTeamBookingsOfUser({
    user,
    teamId,
    startDate: limitDateFrom.toDate(),
    endDate: limitDateTo.toDate(),
    excludedUid: rescheduleUid,
    includeManagedEvents,
  });

  const busyTimes = bookings.map(({ id, startTime, endTime, eventTypeId, title, userId }) => ({
    start: dayjs(startTime).toDate(),
    end: dayjs(endTime).toDate(),
    title,
    source: `eventType-${eventTypeId}-booking-${id}`,
    userId,
  }));

  const limitManager = new LimitManager();

  await getBusyTimesFromBookingLimits({
    bookings: busyTimes,
    bookingLimits,
    dateFrom,
    dateTo,
    limitManager,
    rescheduleUid,
    teamId,
    user,
    includeManagedEvents,
    timeZone,
  });

  return limitManager.getBusyTimes();
};

export const getBusyTimesFromLimits = withReporting(_getBusyTimesFromLimits, "getBusyTimesFromLimits");

export const getBusyTimesFromBookingLimits = withReporting(
  _getBusyTimesFromBookingLimits,
  "getBusyTimesFromBookingLimits"
);

export const getBusyTimesFromTeamLimits = withReporting(
  _getBusyTimesFromTeamLimits,
  "getBusyTimesFromTeamLimits"
);
