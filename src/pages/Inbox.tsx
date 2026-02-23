import { ConversationList } from "@/components/dashboard/ConversationList";
import { ChatThread } from "@/components/dashboard/ChatThread";
import { ConversationDetails } from "@/components/dashboard/ConversationDetails";
import { useChatStore } from "@/stores/chatStore";

export default function Inbox() {
  const activeId = useChatStore((s) => s.activeConversationId);

  return (
    <div className="flex h-full w-full">
      <ConversationList />
      <ChatThread />
      {activeId && <ConversationDetails />}
    </div>
  );
}
