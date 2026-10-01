import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ChatStore } from './chat.store';
import {
    JoinRoomPayload,
    SendMessagePayload,
    AdminReplyPayload,
    ClearChatPayload,
} from './chat.types';

/**
 * ChatGateway — Socket.io WebSocket Gateway
 *
 * Room naming: each table gets its own Socket.io room   → "chat:TABLE_01"
 * Admin joins ALL rooms                                  → "admin"
 *
 * Events (client → server):
 *   joinRoom      { tableId }           → joins the chat room, replays history
 *   sendMessage   { tableId, sender, text }  → broadcasts receiveMessage
 *   adminReply    { tableId, text }     → broadcasts receiveMessage from admin
 *   clearChat     { tableId }           → wipes memory, broadcasts chatCleared
 *
 * Events (server → client):
 *   receiveMessage  ChatMessage
 *   chatHistory     ChatMessage[]
 *   chatCleared     { tableId }
 *   activeRooms     string[]            (admin only, after join)
 */
@WebSocketGateway({
    cors: {
        origin: true,      // reflect request origin
        methods: ['GET', 'POST'],
        credentials: true,
    },
    namespace: '/chat',
    transports: ['websocket', 'polling'],
    allowEIO3: true,       // backwards-compatible for some clients
})
export class ChatGateway
    implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer() server: Server;

    private readonly logger = new Logger(ChatGateway.name);
    /** socketId → tableId (for cleanup on disconnect) */
    private readonly socketRooms = new Map<string, string>();

    constructor(private readonly store: ChatStore) { }

    afterInit(server: Server) {
        this.logger.log('💬 Chat WebSocket Gateway initialized');
    }

    handleConnection(client: Socket) {
        this.logger.debug(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        const tableId = this.socketRooms.get(client.id);
        if (tableId) {
            this.logger.debug(`Client ${client.id} left room for table ${tableId}`);
            this.socketRooms.delete(client.id);
        }
        this.logger.debug(`Client disconnected: ${client.id}`);
    }

    // ─── EVENTS ─────────────────────────────────────────────────────────────────

    /**
     * Customer or admin joins a chat room.
     * Payload: { tableId: "TABLE_01" } | { tableId: "admin" }
     */
    @SubscribeMessage('joinRoom')
    handleJoinRoom(
        @MessageBody() payload: JoinRoomPayload,
        @ConnectedSocket() client: Socket,
    ) {
        const { tableId } = payload;

        if (!tableId) {
            client.emit('error', { message: 'tableId is required' });
            return;
        }

        const roomName = this.roomKey(tableId);
        client.join(roomName);
        this.socketRooms.set(client.id, tableId);

        // Admin connects to a special room to receive all messages
        if (tableId === 'admin') {
            client.join('admin');
            const rooms = this.store.activeRooms();
            client.emit('activeRooms', rooms);
            this.logger.log(`Admin joined. Active rooms: ${rooms.join(', ')}`);
            return;
        }

        // Send chat history to the newly joined customer
        const history = this.store.getMessages(tableId);
        client.emit('chatHistory', history);
        this.logger.log(`Table ${tableId} joined. History: ${history.length} msgs`);

        // Notify admin of active room
        this.server.to('admin').emit('activeRooms', this.store.activeRooms());
    }

    /**
     * Customer sends a message.
     */
    @SubscribeMessage('sendMessage')
    handleSendMessage(@MessageBody() payload: SendMessagePayload) {
        const { tableId, sender, text } = payload;

        if (!tableId || !text?.trim()) return;

        const msg = this.store.addMessage(tableId, sender ?? 'customer', text);

        // Broadcast to the table room AND admin room
        this.server.to(this.roomKey(tableId)).emit('receiveMessage', msg);
        this.server.to('admin').emit('receiveMessage', msg);

        this.logger.debug(`[${tableId}] ${msg.sender}: ${msg.text}`);
    }

    /**
     * Admin replies to a specific table.
     */
    @SubscribeMessage('adminReply')
    handleAdminReply(@MessageBody() payload: AdminReplyPayload) {
        const { tableId, text } = payload;

        if (!tableId || !text?.trim()) return;

        const msg = this.store.addMessage(tableId, 'admin', text);

        // Broadcast to the table room AND admin room
        this.server.to(this.roomKey(tableId)).emit('receiveMessage', msg);
        this.server.to('admin').emit('receiveMessage', msg);

        this.logger.debug(`[${tableId}] admin: ${msg.text}`);
    }

    /**
     * Called when admin marks order as completed.
     * Clears in-memory chat for that table and notifies all parties.
     */
    @SubscribeMessage('clearChat')
    handleClearChat(@MessageBody() payload: ClearChatPayload) {
        const { tableId } = payload;

        if (!tableId) return;

        this.store.clearRoom(tableId);
        const cleared = { tableId };

        this.server.to(this.roomKey(tableId)).emit('chatCleared', cleared);
        this.server.to('admin').emit('chatCleared', cleared);
        this.server.to('admin').emit('activeRooms', this.store.activeRooms());

        this.logger.log(`💥 Chat cleared for table ${tableId}`);
    }

    // ─── UTILS ──────────────────────────────────────────────────────────────────

    private roomKey(tableId: string): string {
        return `chat:${tableId}`;
    }

    /** Expose for external use (e.g. OrdersService on completion) */
    broadcastClearChat(tableId: string) {
        this.store.clearRoom(tableId);
        this.server.to(this.roomKey(tableId)).emit('chatCleared', { tableId });
        this.server.to('admin').emit('chatCleared', { tableId });
        this.server.to('admin').emit('activeRooms', this.store.activeRooms());
    }
}
