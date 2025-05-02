
import { mutation, query } from "./_generated/server";
import {  v } from "convex/values";
import { DURATIONS, TICKET_STATUS, WAITING_LIST_STATUS } from "./constants";
import { internal } from "./_generated/api";

export const get = query({
    args: {},
    handler: async (ctx) =>{
        return await ctx.db
            .query("events")
            .filter((q) => q.eq(q.field("is_cancelled"), undefined))
            .collect()
        }
    });

export const getById = query({
    args: {eventId: v.id("events")},
    handler: async (ctx, {eventId}) =>{
        return await ctx.db.get(eventId)
    }
})

export const getEventAvailability = query({
    args: {eventId: v.id("events")},
    handler: async (ctx, {eventId}) =>{
        const event = await ctx.db.get(eventId)
        if (!event) throw new Error( "Event not found")
       
        // Count total purchased tickets
        const purchasedCount = await ctx.db
            .query("tickets")
            .withIndex("by_event", (q) =>q.eq("eventId", eventId))
            .collect()
            .then(
                (tickets) =>
                    tickets.filter(
                        (t) => 
                            t.status === TICKET_STATUS.VALID ||
                            t.status === TICKET_STATUS.USED)
                        .length
            );

            // Count current valid offers
            const now = Date.now();
            const activeOffers = await ctx.db
                .query("waitingList")
                .withIndex("by_event_status", (q) =>
                q.eq("eventId", eventId).eq("status", WAITING_LIST_STATUS.OFFERED)
                )
                .collect()
                .then(
                    (entries) => entries.filter((e) => (e.offerExpiresAt ?? 0) > now)
                .length
                );

                const totalReseved = purchasedCount + activeOffers;

                return{
                    isSoldOut: totalReseved >= event.totalTickets,
                    totalTickets: event.totalTickets,
                    purchasedCount,
                    activeOffers,
                    remainingTickets: Math.max(0, event.totalTickets - totalReseved)
                }
    }
})

// Helper function to check availability
export const checkAvailability = query({
    args: {eventId: v.id("events")},
    handler: async (ctx, {eventId}) => {
        const event = await ctx.db.get(eventId)
        if (!event) throw new Error("Event not found")

        // count total purchased tickets
        const purchasedCount = await ctx.db
            .query("tickets")
            .withIndex("by_event", (q) => q.eq("eventId", eventId))
            .collect()
            .then(
                (tickets) =>
                    tickets.filter(
                        (t) =>
                            t.status === TICKET_STATUS.VALID ||
                            t.status === TICKET_STATUS.USED
                    ).length
            );

        // count current valid offers
        const now = Date.now();
        const activeOffers = await ctx.db
            .query("waitingList")
            .withIndex("by_event_status", (q) =>
                q.eq("eventId", eventId).eq("status", WAITING_LIST_STATUS.OFFERED)
            )
            .collect()
            .then(
                (entries) =>
                    entries.filter((e) => (e.offerExpiresAt ?? 0) > now).length
            );

            const availableSpots = event.totalTickets - (purchasedCount + activeOffers)

            return{
                available: availableSpots > 0,
                availableSpots,
                totalTickets: event.totalTickets,
                purchasedCount,
                activeOffers,
            }
    }
})

// Join Waiting List for an event

export const joinWaitingList = mutation({
    // Function takes an event ID and user ID as arguments

    args:{eventId: v.id("events"), userId: v.string()},

    handler: async (ctx, {eventId, userId}) => {
        // Rate Limit Check
        // const status = await rateLimiter.limit(ctx, "queueJoin", {key: userId});
        // if(!status.ok){
        //     `You've joined the waiting list too many times. Please wait ${Math.ceil(status.retryAfter / (60 * 1000))} minutes before trying again.`
        // }

        // First check if user already has an active entry in waiting list for this event
        const existingEntry = await ctx.db
            .query("waitingList")
            .withIndex("by_user_event", (q) =>
                q.eq("userId", userId).eq("eventId", eventId)
            )
            .filter((q) => q.neq(q.field("status"), WAITING_LIST_STATUS.EXPIRED))
            .first()

            // Dont allow duplicate entries
            if(existingEntry){
                throw new Error("You are already on the waiting list for this event.")
            }

            // Verify the event exist
            const event = await ctx.db.get(eventId);
            if(!event){
                throw new Error("Event not found")
            }

            // Check if event is sold out
            const {available} = await checkAvailability(ctx, {eventId});

            const now = Date.now()

            if(available){
                // If tickets are available, create an offer entry
                const waitingListId = await ctx.db.insert("waitingList",{
                    eventId,
                    userId,
                    status: WAITING_LIST_STATUS.OFFERED,
                    offerExpiresAt: now + DURATIONS.TICKET_OFFER,
                });

                // Schedule a job to expire this offer after the offer duration
                await ctx.scheduler.runAfter(
                    DURATIONS.TICKET_OFFER,
                    internal.waitingList.expireOffer,
                    {
                        waitingListId,
                        eventId
                    }
                )
            } else{
                // If no tickets available, add to waiting list
                await ctx.db.insert("waitingList", {
                    eventId,
                    userId,
                    status: WAITING_LIST_STATUS.WAITING,
                })
            }

            // Return appropraite status message
            return {
               success: true,
               status: available
                ? WAITING_LIST_STATUS.OFFERED
                : WAITING_LIST_STATUS.WAITING,
               message: available
                ? `Ticket offered - you have ${DURATIONS.TICKET_OFFER / (60 * 1000)} minutes to purchase`
                : "Added to waiting list - you will be notified when a ticket becomes available",
            };
    }
})

// Create Event

export const create = mutation({
    args:{
        name: v.string(),
        description: v.string(),
        location: v.string(),
        eventDate: v.number(), // Store as timestamp
        price: v.number(),
        totalTickets: v.number(),
        userId: v.string(),
    },
    handler: async (ctx, args) => {
        const eventId = await ctx.db.insert("events", {
          name: args.name,
          description: args.description,
          location: args.location,
          eventDate: args.eventDate,
          price: args.price,
          totalTickets: args.totalTickets,
          userId: args.userId,
        });
        return eventId;
      },
})

// Update Events

export const updateEvent = mutation ({
    args:{
        eventId: v.id("events"),
        name: v.string(),
        description: v.string(),
        location: v.string(),
        eventDate: v.number(),
        price: v.number(),
        totalTickets: v.number(),
    },
    handler: async (ctx, args) => {
        const { eventId, ...updates } = args;
    
        // Get current event to check tickets sold
        const event = await ctx.db.get(eventId);
        if (!event) throw new Error("Event not found");
    
        const soldTickets = await ctx.db
          .query("tickets")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
          .filter((q) =>
            q.or(q.eq(q.field("status"), "valid"), q.eq(q.field("status"), "used"))
          )
          .collect();
    
        // Ensure new total tickets is not less than sold tickets
        if (updates.totalTickets < soldTickets.length) {
          throw new Error(
            `Cannot reduce total tickets below ${soldTickets.length} (number of tickets already sold)`
          );
        }
    
        await ctx.db.patch(eventId, updates);
        return eventId;
      },
})