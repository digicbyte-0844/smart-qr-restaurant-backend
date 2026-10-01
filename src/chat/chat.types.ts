export type MessageSender = 'customer' | 'admin';

export interface ChatMessage {
    id: string;
    tableId: string;
    sender: MessageSender;
    text: string;
    timestamp: number; // Unix ms – no Firestore, purely in-memory
}

export interface JoinRoomPayload {
    tableId: string;
}

export interface SendMessagePayload {
    tableId: string;
    sender: MessageSender;
    text: string;
}

export interface AdminReplyPayload {
    tableId: string;
    text: string;
}

export interface ClearChatPayload {
    tableId: string;
}
