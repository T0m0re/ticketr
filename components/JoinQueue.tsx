"use client"

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Spinner from "./Spinner";
import { WAITING_LIST_STATUS } from "@/convex/constants";
import { Clock, OctagonXIcon } from "lucide-react";

function JoinQueue({
    eventId, 
    userId
}:{
    eventId: Id<"events">, 
    userId: string;
}) {
    const {toast} = useToast()
    const joinWaitingList = useMutation(api.events.joinWaitingList)
    const queuePosition = useQuery(api.waitingList.getQueuePosition,{
        eventId,
        userId,
    });
    const userTicket = useQuery(api.tickets.getUserTicketForEvent, {
        eventId,
        userId,
    })

    const availability = useQuery(api.events.getEventAvailability, {eventId});
    const event = useQuery(api.events.getById, {eventId});

    const isEventOwner = userId === event?.userId;

    const handleJoinQueue = async () => {
        try {
            const result = await joinWaitingList({eventId, userId});
            if(result.success){
                console.log("Successfully joined waiting list")
            }
        } catch (error) {
            if(
                error instanceof ConvexError &&
                error.message.includes("joined the waiting list too many times")
            ){
                toast({
                    variant: "destructive",
                    title: "slow down there!",
                    description: error.data,
                    duration: 5000,
                })
            } else{
                console.error("Error joining the waiting list:", error);
                toast({
                    variant: "destructive",
                    title: "Uh oh! Something went wrong",
                    description: "Failed to join queue. Plese try again."
                })
            }
        }
    }

    if(queuePosition === undefined || availability === undefined || !event){
        return <Spinner/>
    }

    if (userTicket){
        return null
    }

    const isPastEvent = event.eventDate < Date.now()
  return (
    <div>

       {(!queuePosition ||
            queuePosition.status === WAITING_LIST_STATUS.EXPIRED ||
            (queuePosition.status === WAITING_LIST_STATUS.OFFERED &&
                queuePosition.offerExpiresAt && 
                queuePosition.offerExpiresAt <= Date.now())) && (
                    <>
                    {isEventOwner ? (
                        <div className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-gray-100 text-gray-700 rounded-lg">
                            <OctagonXIcon className="w-5 h-5"/>
                            <span>You cannot buy a ticket for your own event</span>
                        </div>
                    ): isPastEvent ? (
                            <div className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-gray-100 text-gray-700 rounded-lg">
                                <Clock className="w-5 h-5"/>
                                <span>Event has passed</span>
                            </div>
                        ) : availability.purchasedCount >= availability.totalTickets ? (
                            <div className="text-center p-4">
                                <p className="text-lg font-semibold text-red-600">
                                    Sorry, this event is sold out.
                                </p>
                            </div>
                        ) : (
                            <button
                            onClick={handleJoinQueue}
                            disabled={isEventOwner || isPastEvent}
                            className="w-full bg-blue-600 text-white px-8 py-4 rounded-lg font-medium shadow-md hover:bg-blue-700 transition-colors duration-200 flex items-center justify-center disabled:bg-gray-400 disabled:cursor-not-allowed:"
                            >
                                Buy Ticket
                            </button>
                        )
                }
                    </>
            )
       } 
    </div>
  )
}
export default JoinQueue