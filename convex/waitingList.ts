import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { WAITING_LIST_STATUS } from "./constants";

export const getQueuePosition = query({
    args:{
        eventId: v.id("events"),
        userId: v.string(),
    },
    handler: async (ctx, {eventId, userId}) => {
        // Get entry for this specific user and event combination
        const entry = await ctx.db
            .query("waitingList")
            .withIndex("by_user_event", (q) =>
                q.eq("userId", userId).eq("eventId", eventId)
            )
            .filter((q) => q.neq(q.field("status"), WAITING_LIST_STATUS.EXPIRED))
            .first();

            if(!entry) return null;


            // Get total numeber of people ahead in line
            const peopleAhead = await ctx.db
                .query("waitingList")
                .withIndex("by_event_status", (q) =>
                    q.eq("eventId", eventId))
                .filter((q) =>
                    q.and(
                        q.lt(q.field("_creationTime"), entry?._creationTime),
                        q.or(
                            q.eq(q.field("status"), WAITING_LIST_STATUS.WAITING),
                            q.eq(q.field("status"), WAITING_LIST_STATUS.OFFERED)
                            )
                        )
                    )
                    .collect()
                    .then((entries) => entries.length)

            return {
                ...entry,
                position: peopleAhead + 1,
            }
    }
})

/**
    * Internal mutation to expire a single offer and process the queue
    * Called by scheduled job when offer timer expires
 */

export const expireOffer = internalMutation({
    args:{
        waitingListId: v.id("waitingList"),
        eventId: v.id("events"),
    },
    handler: async (ctx, {waitingListId, eventId}) => {
        const offer = await ctx.db.get(waitingListId);
        // It oofer is not found or is not in OFFERD status, do nothing
        if(!offer || offer.status !== WAITING_LIST_STATUS.OFFERED) return;

        await ctx.db.patch(waitingListId, {
            status: WAITING_LIST_STATUS.EXPIRED,
        })

        // Process queue to offer ticket to next person
        await processQueue(ctx, {eventId});
    }
})

export const releaseTicket = mutation({
    args:{
        eventId: v.id("events"),
        waitingListId: v.id("waitingList"),
    },
    handler: async (ctx, {eventId, waitingListId}) => {
        const entry = await ctx.db.get(waitingListId);
        if(!entry || entry.status !== WAITING_LIST_STATUS.OFFERED){
            throw new Error("No valid ticket offer found")
        }

        // Mark the entry as expired
        await ctx.db.patch(waitingListId, {
            status: WAITING_LIST_STATUS.EXPIRED,
        });

        // Process queue to offer ticket to next person
        // await processQueue(ctx, {eventId});
    }

})