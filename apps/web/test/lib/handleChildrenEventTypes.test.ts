/* eslint-disable @typescript-eslint/no-unused-vars */
import prismaMock from "../../../../tests/libs/__mocks__/prismaMock";

import type { EventType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import updateChildrenEventTypes from "@calcom/features/ee/managed-event-types/lib/handleChildrenEventTypes";
import { buildEventType } from "@calcom/lib/test/builder";
import type { Prisma } from "@calcom/prisma/client";
import { SchedulingType } from "@calcom/prisma/enums";
import type { CompleteEventType, CompleteWorkflowsOnEventTypes } from "@calcom/prisma/zod";

const mockFindFirstEventType = (data?: Partial<CompleteEventType>) => {
  const eventType = buildEventType(data as Partial<EventType>);
  // const { scheduleId, destinationCalendar, ...restEventType } = eventType;
  prismaMock.eventType.findFirst.mockResolvedValue(eventType as EventType);

  return eventType;
};

vi.mock("@calcom/emails/email-manager", () => {
  return {
    sendSlugReplacementEmail: () => ({}),
  };
});

vi.mock("@calcom/lib/server/i18n", () => {
  return {
    getTranslation: (key: string) => key,
  };
});

describe("handleChildrenEventTypes", () => {
  describe("Shortcircuits", () => {
    it("Returns message 'No managed event type'", async () => {
      mockFindFirstEventType();

      const result = await updateChildrenEventTypes({
        eventTypeId: 1,
        oldEventType: { children: [], team: { name: "" } },
        children: [],
        updatedEventType: { schedulingType: null, slug: "something" },
        currentUserId: 1,
        prisma: prismaMock,
        profileId: null,
        updatedValues: {},
      });
      expect(result.newUserIds).toEqual(undefined);
      expect(result.oldUserIds).toEqual(undefined);
      expect(result.deletedUserIds).toEqual(undefined);
      expect(result.deletedExistentEventTypes).toEqual(undefined);
      expect(result.message).toBe("No managed event type");
    });

    it("Returns message 'No managed event metadata'", async () => {
      mockFindFirstEventType({
        metadata: {},
        locations: [],
      });
      const result = await updateChildrenEventTypes({
        eventTypeId: 1,
        oldEventType: { children: [], team: { name: "" } },
        children: [],
        updatedEventType: { schedulingType: "MANAGED", slug: "something" },
        currentUserId: 1,
        prisma: prismaMock,
        profileId: null,
        updatedValues: {},
      });
      expect(result.newUserIds).toEqual(undefined);
      expect(result.oldUserIds).toEqual(undefined);
      expect(result.deletedUserIds).toEqual(undefined);
      expect(result.deletedExistentEventTypes).toEqual(undefined);
      expect(result.message).toBe("No managed event metadata");
    });

    it("Returns message 'Missing event type'", async () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      prismaMock.eventType.findFirst.mockImplementation(() => {
        return new Promise((resolve) => {
          resolve(null);
        });
      });
      const result = await updateChildrenEventTypes({
        eventTypeId: 1,
        oldEventType: { children: [], team: { name: "" } },
        children: [],
        updatedEventType: { schedulingType: "MANAGED", slug: "something" },
        currentUserId: 1,
        prisma: prismaMock,
        profileId: null,
        updatedValues: {},
      });
      expect(result.newUserIds).toEqual(undefined);
      expect(result.oldUserIds).toEqual(undefined);
      expect(result.deletedUserIds).toEqual(undefined);
      expect(result.deletedExistentEventTypes).toEqual(undefined);
      expect(result.message).toBe("Missing event type");
    });
  });

  describe("Happy paths", () => {
    it("Adds new users", async () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const {
        schedulingType,
        id,
        teamId,
        timeZone,
        requiresBookerEmailVerification,
        lockTimeZoneToggleOnBookingPage,
        useEventTypeDestinationCalendarEmail,
        secondaryEmailId,
        autoTranslateDescriptionEnabled,
        includeNoShowInRRCalculation,
        instantMeetingScheduleId,
        ...evType
      } = mockFindFirstEventType({
        id: 123,
        metadata: { managedEventConfig: {} },
        locations: [],
      });
      const result = await updateChildrenEventTypes({
        eventTypeId: 1,
        oldEventType: { children: [], team: { name: "" } },
        children: [{ hidden: false, owner: { id: 4, name: "", email: "", eventTypeSlugs: [] } }],
        updatedEventType: { schedulingType: "MANAGED", slug: "something" },
        currentUserId: 1,
        prisma: prismaMock,
        profileId: null,
        updatedValues: {},
      });
      expect(prismaMock.eventType.create).toHaveBeenCalledWith({
        data: {
          ...evType,
          parentId: 1,
          users: { connect: [{ id: 4 }] },
          lockTimeZoneToggleOnBookingPage: false,
          requiresBookerEmailVerification: false,
          bookingLimits: undefined,
          durationLimits: undefined,
          recurringEvent: undefined,
          eventTypeColor: undefined,
          customReplyToEmail: null,
          userId: 4,
          rrSegmentQueryValue: undefined,
          assignRRMembersUsingSegment: false,
          useBookerTimezone: false,
          restrictionScheduleId: null,
          allowReschedulingCancelledBookings: false,
        },
      });
      expect(result.newUserIds).toEqual([4]);
      expect(result.oldUserIds).toEqual([]);
      expect(result.deletedUserIds).toEqual([]);
      expect(result.deletedExistentEventTypes).toEqual(undefined);
    });

    it("Updates old users", async () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const {
        schedulingType,
        id,
        teamId,
        timeZone,
        locations,
        parentId,
        userId,
        scheduleId,
        requiresBookerEmailVerification,
        lockTimeZoneToggleOnBookingPage,
        useEventTypeDestinationCalendarEmail,
        secondaryEmailId,
        assignRRMembersUsingSegment,
        includeNoShowInRRCalculation,
        instantMeetingScheduleId,
        ...evType
      } = mockFindFirstEventType({
        metadata: { managedEventConfig: {} },
        locations: [],
      });
      const result = await updateChildrenEventTypes({
        eventTypeId: 1,
        oldEventType: { children: [{ userId: 4 }], team: { name: "" } },
        children: [{ hidden: false, owner: { id: 4, name: "", email: "", eventTypeSlugs: [] } }],
        updatedEventType: { schedulingType: "MANAGED", slug: "something" },
        currentUserId: 1,
        prisma: prismaMock,
        profileId: null,
        updatedValues: {
          bookingLimits: undefined,
        },
      });
      const { profileId, autoTranslateDescriptionEnabled, ...rest } = evType;
      expect(prismaMock.eventType.update).toHaveBeenCalledWith({
        data: {
          ...rest,
          useEventLevelSelectedCalendars: undefined,
          customReplyToEmail: null,
          rrSegmentQueryValue: undefined,
          locations: [],
          scheduleId: null,
          lockTimeZoneToggleOnBookingPage: false,
          requiresBookerEmailVerification: false,
          useBookerTimezone: false,
          restrictionScheduleId: null,
          hashedLink: {
            deleteMany: {},
          },
          instantMeetingScheduleId: undefined,
          allowReschedulingCancelledBookings: false,
        },
        where: {
          userId_parentId: {
            userId: 4,
            parentId: 1,
          },
        },
      });
      expect(result.newUserIds).toEqual([]);
      expect(result.oldUserIds).toEqual([4]);
      expect(result.deletedUserIds).toEqual([]);
      expect(result.deletedExistentEventTypes).toEqual(undefined);
    });

    it("Deletes old users", async () => {
      mockFindFirstEventType({ users: [], metadata: { managedEventConfig: {} }, locations: [] });
      const result = await updateChildrenEventTypes({
        eventTypeId: 1,
        oldEventType: { children: [{ userId: 4 }], team: { name: "" } },
        children: [],
        updatedEventType: { schedulingType: "MANAGED", slug: "something" },
        currentUserId: 1,
        prisma: prismaMock,
        profileId: null,
        updatedValues: {},
      });
      expect(result.newUserIds).toEqual([]);
      expect(result.oldUserIds).toEqual([]);
      expect(result.deletedUserIds).toEqual([4]);
      expect(result.deletedExistentEventTypes).toEqual(undefined);
    });

    it("Adds new users and updates/delete old users", async () => {
      mockFindFirstEventType({
        metadata: { managedEventConfig: {} },
        locations: [],
      });
      const result = await updateChildrenEventTypes({
        eventTypeId: 1,
        oldEventType: { children: [{ userId: 4 }, { userId: 1 }], team: { name: "" } },
        children: [
          { hidden: false, owner: { id: 4, name: "", email: "", eventTypeSlugs: [] } },
          { hidden: false, owner: { id: 5, name: "", email: "", eventTypeSlugs: [] } },
        ],
        updatedEventType: { schedulingType: "MANAGED", slug: "something" },
        currentUserId: 1,
        prisma: prismaMock,
        profileId: null,
        updatedValues: {},
      });
      // Have been called
      expect(result.newUserIds).toEqual([5]);
      expect(result.oldUserIds).toEqual([4]);
      expect(result.deletedUserIds).toEqual([1]);
      expect(result.deletedExistentEventTypes).toEqual(undefined);
    });
  });

  describe("Slug conflicts", () => {
    it("Deletes existent event types for new users added", async () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const {
        schedulingType,
        id,
        teamId,
        timeZone,
        requiresBookerEmailVerification,
        lockTimeZoneToggleOnBookingPage,
        useEventTypeDestinationCalendarEmail,
        secondaryEmailId,
        autoTranslateDescriptionEnabled,
        includeNoShowInRRCalculation,
        instantMeetingScheduleId,
        assignRRMembersUsingSegment,
        ...evType
      } = mockFindFirstEventType({
        id: 123,
        metadata: { managedEventConfig: {} },
        locations: [],
      });
      prismaMock.eventType.deleteMany.mockResolvedValue([123] as unknown as Prisma.BatchPayload);
      const result = await updateChildrenEventTypes({
        eventTypeId: 1,
        oldEventType: { children: [], team: { name: "" } },
        children: [{ hidden: false, owner: { id: 4, name: "", email: "", eventTypeSlugs: ["something"] } }],
        updatedEventType: { schedulingType: "MANAGED", slug: "something" },
        currentUserId: 1,
        prisma: prismaMock,
        profileId: null,
        updatedValues: {},
      });
      expect(prismaMock.eventType.create).toHaveBeenCalledWith({
        data: {
          ...evType,
          parentId: 1,
          users: { connect: [{ id: 4 }] },
          bookingLimits: undefined,
          durationLimits: undefined,
          recurringEvent: undefined,
          eventTypeColor: undefined,
          customReplyToEmail: null,
          instantMeetingScheduleId: undefined,
          lockTimeZoneToggleOnBookingPage: false,
          requiresBookerEmailVerification: false,
          userId: 4,
          workflows: undefined,
          rrSegmentQueryValue: undefined,
          assignRRMembersUsingSegment: false,
          useBookerTimezone: false,
          restrictionScheduleId: null,
          allowReschedulingCancelledBookings: false,
        },
      });
      expect(result.newUserIds).toEqual([4]);
      expect(result.oldUserIds).toEqual([]);
      expect(result.deletedUserIds).toEqual([]);
      expect(result.deletedExistentEventTypes).toEqual([123]);
    });
    it("Deletes existent event types for old users updated", async () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const {
        schedulingType,
        id,
        teamId,
        timeZone,
        locations,
        parentId,
        userId,
        requiresBookerEmailVerification,
        lockTimeZoneToggleOnBookingPage,
        useEventTypeDestinationCalendarEmail,
        secondaryEmailId,
        includeNoShowInRRCalculation,
        instantMeetingScheduleId,
        assignRRMembersUsingSegment,
        rrSegmentQueryValue,
        useEventLevelSelectedCalendars,
        ...evType
      } = mockFindFirstEventType({
        metadata: { managedEventConfig: {} },
        locations: [],
      });
      prismaMock.eventType.deleteMany.mockResolvedValue([123] as unknown as Prisma.BatchPayload);
      const result = await updateChildrenEventTypes({
        eventTypeId: 1,
        oldEventType: { children: [{ userId: 4 }], team: { name: "" } },
        children: [{ hidden: false, owner: { id: 4, name: "", email: "", eventTypeSlugs: ["something"] } }],
        updatedEventType: { schedulingType: "MANAGED", slug: "something" },
        currentUserId: 1,
        prisma: prismaMock,
        profileId: null,
        updatedValues: {
          length: 30,
        },
      });
      const { profileId, autoTranslateDescriptionEnabled, ...rest } = evType;
      expect(prismaMock.eventType.update).toHaveBeenCalledWith({
        data: {
          ...rest,
          customReplyToEmail: null,
          locations: [],
          hashedLink: {
            deleteMany: {},
          },
          useBookerTimezone: false,
          lockTimeZoneToggleOnBookingPage: false,
          requiresBookerEmailVerification: false,
          allowReschedulingCancelledBookings: false,
        },
        where: {
          userId_parentId: {
            userId: 4,
            parentId: 1,
          },
        },
      });
      expect(result.newUserIds).toEqual([]);
      expect(result.oldUserIds).toEqual([4]);
      expect(result.deletedUserIds).toEqual([]);
      expect(result.deletedExistentEventTypes).toEqual([123]);
    });
  });

  describe("Workflows", () => {
    it("Links workflows to new and existing assigned members", async () => {
      const {
        schedulingType: _schedulingType,
        id: _id,
        teamId: _teamId,
        locations: _locations,
        timeZone: _timeZone,
        parentId: _parentId,
        userId: _userId,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        requiresBookerEmailVerification,
        lockTimeZoneToggleOnBookingPage,
        useEventTypeDestinationCalendarEmail,
        secondaryEmailId,
        autoTranslateDescriptionEnabled,
        includeNoShowInRRCalculation,
        instantMeetingScheduleId,
        assignRRMembersUsingSegment,
        ...evType
      } = mockFindFirstEventType({
        metadata: { managedEventConfig: {} },
        locations: [],
        workflows: [
          {
            workflowId: 11,
          } as CompleteWorkflowsOnEventTypes,
        ],
      });

      // Mock the event type that will be returned for existing users
      const mockUpdatedEventType = {
        id: 2,
        userId: 4,
        timeZone: "UTC",
        teamId: 1,
        autoTranslateDescriptionEnabled: false,
        secondaryEmailId: null,
        schedulingType: SchedulingType.MANAGED,
        requiresBookerEmailVerification: false,
        lockTimeZoneToggleOnBookingPage: false,
        useEventTypeDestinationCalendarEmail: false,
        workflows: [],
        parentId: 1,
        locations: [],
        instantMeetingScheduleId: null,
        assignRRMembersUsingSegment: false,
        includeNoShowInRRCalculation: false,
        ...evType,
      };

      prismaMock.eventType.update.mockResolvedValue(mockUpdatedEventType);

      await updateChildrenEventTypes({
        eventTypeId: 1,
        oldEventType: { children: [{ userId: 4 }], team: { name: "" } },
        children: [
          { hidden: false, owner: { id: 4, name: "", email: "", eventTypeSlugs: [] } },
          { hidden: false, owner: { id: 5, name: "", email: "", eventTypeSlugs: [] } },
        ],
        updatedEventType: { schedulingType: "MANAGED", slug: "something" },
        currentUserId: 1,
        prisma: prismaMock,
        profileId: null,
        updatedValues: {},
      });

      expect(prismaMock.eventType.create).toHaveBeenCalledWith({
        data: {
          ...evType,
          bookingLimits: undefined,
          durationLimits: undefined,
          recurringEvent: undefined,
          eventTypeColor: undefined,
          customReplyToEmail: null,
          locations: [],
          lockTimeZoneToggleOnBookingPage: false,
          requiresBookerEmailVerification: false,
          useBookerTimezone: false,
          restrictionScheduleId: null,
          parentId: 1,
          userId: 5,
          users: {
            connect: [{ id: 5 }],
          },
          workflows: {
            create: [{ workflowId: 11 }],
          },
          rrSegmentQueryValue: undefined,
          assignRRMembersUsingSegment: false,
          useEventLevelSelectedCalendars: false,
          allowReschedulingCancelledBookings: false,
        },
      });
      const { profileId, rrSegmentQueryValue, ...rest } = evType;
      if ("workflows" in rest) delete rest.workflows;
      expect(prismaMock.eventType.update).toHaveBeenCalledWith({
        data: {
          ...rest,
          locations: [],
          useEventLevelSelectedCalendars: undefined,
          customReplyToEmail: null,
          lockTimeZoneToggleOnBookingPage: false,
          requiresBookerEmailVerification: false,
          useBookerTimezone: false,
          restrictionScheduleId: null,
          hashedLink: {
            deleteMany: {},
          },
        },
        where: {
          userId_parentId: {
            userId: 4,
            parentId: 1,
          },
        },
      });
      expect(prismaMock.workflowsOnEventTypes.upsert).toHaveBeenCalledWith({
        create: {
          eventTypeId: 2,
          workflowId: 11,
        },
        update: {},
        where: {
          workflowId_eventTypeId: {
            eventTypeId: 2,
            workflowId: 11,
          },
        },
      });
    });
  });
});
