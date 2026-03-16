import { Activity } from "lucide-react";
import { NAV_ITEMS } from "./Header.jsx";

export function MobileDock({ view, setView, onToggleEvents, eventsOpen }) {
  return (
    <div className="dock md:hidden">
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          className={id === view ? "dock-active" : undefined}
          onClick={() => setView(id)}
        >
          <Icon className="size-[1.2em]" />
          <span className="dock-label">{label}</span>
        </button>
      ))}
      <button
        className={eventsOpen ? "dock-active" : undefined}
        onClick={onToggleEvents}
      >
        <Activity className="size-[1.2em]" />
        <span className="dock-label">Events</span>
      </button>
    </div>
  );
}

export default MobileDock;
