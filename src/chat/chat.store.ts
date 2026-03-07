import { Injectable } from '@nestjs/common';
import { ChatMessage, MessageSender } from './chat.types';
import { randomUUID } from 'crypto';

/**
 * ChatStore — pure in-memory storage.
 * No Firestore, no DB. Data lives only while the process is running.
 * Key  : tableId  (e.g. "TABLE_01")
 * Value: ordered array of ChatMessage
 */
@Injectable()
export class ChatStore {
    /** Map<tableId, ChatMessage[]> */
    private readonly rooms = new Map<string, ChatMessage[]>();

    /** Ensure room exists and return its messages */
    getMessages(tableId: string): ChatMessage[] {
        if (!this.rooms.has(tableId)) {
            this.rooms.set(tableId, []);
        }
        return this.rooms.get(tableId)!;
    }

    /** Append a message and return it */
    addMessage(tableId: string, sender: MessageSender, text: string): ChatMessage {
        const msg: ChatMessage = {
            id: randomUUID(),
            tableId,
            sender,
            text: text.trim(),
            timestamp: Date.now(),
        };
        this.getMessages(tableId).push(msg);
        return msg;
    }

    /** Wipe all messages for a table — called on order completion */
    clearRoom(tableId: string): void {
        this.rooms.delete(tableId);
    }

    /** All active room IDs (for admin overview) */
    activeRooms(): string[] {
        return Array.from(this.rooms.keys());
    }

    /** How many messages in a room */
    messageCount(tableId: string): number {
        return this.rooms.get(tableId)?.length ?? 0;
    }
}
