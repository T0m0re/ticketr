
import { mutation, query } from "./_generated/server";
import {  v } from "convex/values";
import { TICKET_STATUS, WAITING_LIST_STATUS } from "./constants";

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

    handler: async (ctx, {eventId, UserId}) => {
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

    }
})