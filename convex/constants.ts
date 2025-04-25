import { Doc } from "./_generated/dataModel";

// Time constant in milliseconds
export const DURATIONS ={
    TICKET_OFFER: 30 * 60 * 1000, // 30 minutes
} as const;

// Status types for better type safety
export const WAITING_LIST_STATUS = {
    WAITING: "waiting",
    OFFERED: "offered",
    EXPIRED: "expired",
    PURCHASED: "purchased",
} as const satisfies Record<string, Doc<"waitingList">["status"]>;

export const TICKET_STATUS = {
    VALID: "valid",
    USED: "used",
    REFUNDED: "refunded",
    CANCELLED: "cancelled"
} as const satisfies Record<string, Doc<"tickets">["status"]>;