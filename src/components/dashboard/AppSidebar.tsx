import { Inbox, Users, BookOpen, Zap, Settings, Cloud, LogOut, Moon, Sun, Circle } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuthStore } from "@/stores/authStore";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useChatStore } from "@/stores/chatStore";

const navItems = [
  { title: "Inbox", url: "/inbox", icon: Inbox },
  { title: "Contatos", url: "/contacts", icon: Users },
  { title: "Base de Conhecimento", url: "/knowledge", icon: BookOpen },
  { title: "Macros", url: "/macros", icon: Zap },
  { title: "Configurações", url: "/settings", icon: Settings },
];

const statusColors: Record<string, string> = {
  online: "bg-status-online",
  away: "bg-status-away",
  offline: "bg-status-offline",
};

export function AppSidebar() {
  const { agent, signOut, updateStatus } = useAuthStore();
  const { theme, toggleTheme } = useTheme();
  const conversations = useChatStore((s) => s.conversations);
  const openCount = conversations.filter((c) => c.status === "open").length;

  const initials = agent?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <aside className="w-16 hover:w-56 transition-all duration-200 group/sidebar bg-sidebar border-r border-sidebar-border flex flex-col h-screen overflow-hidden shrink-0">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 gap-2 border-b border-sidebar-border shrink-0">
        <Cloud className="h-6 w-6 text-primary shrink-0" />
        <span className="text-sm font-bold text-foreground opacity-0 group-hover/sidebar:opacity-100 transition-opacity whitespace-nowrap">
          CloudDesk
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-1 px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end={item.url === "/inbox"}
            className="flex items-center gap-3 px-2 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors text-sm"
            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity whitespace-nowrap">
              {item.title}
            </span>
            {item.url === "/inbox" && openCount > 0 && (
              <Badge className="ml-auto bg-unread-badge text-primary-foreground text-[10px] px-1.5 py-0 h-5 min-w-5 flex items-center justify-center opacity-0 group-hover/sidebar:opacity-100 transition-opacity">
                {openCount}
              </Badge>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-2 space-y-2 shrink-0">
        <Button variant="ghost" size="icon" onClick={toggleTheme} className="w-full flex items-center gap-3 justify-start px-2">
          {theme === "dark" ? <Sun className="h-5 w-5 shrink-0" /> : <Moon className="h-5 w-5 shrink-0" />}
          <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity text-sm whitespace-nowrap">
            {theme === "dark" ? "Modo claro" : "Modo escuro"}
          </span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-sidebar-accent transition-colors">
              <div className="relative shrink-0">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
                </Avatar>
                <Circle className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 fill-current ${statusColors[agent?.status || "offline"]} text-sidebar rounded-full`} />
              </div>
              <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity text-sm text-sidebar-foreground truncate whitespace-nowrap">
                {agent?.name}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-48">
            <DropdownMenuItem onClick={() => updateStatus("online")}>
              <Circle className="h-3 w-3 fill-status-online text-status-online mr-2" /> Online
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => updateStatus("away")}>
              <Circle className="h-3 w-3 fill-status-away text-status-away mr-2" /> Ausente
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => updateStatus("offline")}>
              <Circle className="h-3 w-3 fill-status-offline text-status-offline mr-2" /> Offline
            </DropdownMenuItem>
            <DropdownMenuItem onClick={signOut}>
              <LogOut className="h-3 w-3 mr-2" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
