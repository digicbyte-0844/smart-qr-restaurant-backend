import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatStore } from './chat.store';

@Module({
    providers: [ChatGateway, ChatStore],
    exports: [ChatGateway, ChatStore], // export so OrdersModule can call broadcastClearChat
})
export class ChatModule { }
