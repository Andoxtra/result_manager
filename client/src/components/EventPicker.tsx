import { Alert, Loader, Select } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, type EventSummary } from "../api";
import { useAuth } from "../auth";
import { formatDate, STATUS_LABELS } from "../format";

const STORAGE_KEY = "result-manager.event";

function storedEventId(): number | null {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * The event a page works on. Issuers, scorers and evaluators always work on the running
 * event (the server does not show them any other). Admins can pick any event; without a
 * choice they get the running one.
 */
export function useEventChoice() {
  const { can } = useAuth();
  const isAdmin = can();
  const query = useQuery({
    queryKey: ["events"],
    queryFn: () => api.get<EventSummary[]>("/events"),
    refetchInterval: 15_000,
  });
  const [chosenId, setChosenId] = useState<number | null>(storedEventId);
  const events = query.data ?? [];
  const running = events.find((e) => e.status === "OPEN") ?? null;
  const event = isAdmin ? (events.find((e) => e.id === chosenId) ?? running ?? events[0] ?? null) : running;

  const choose = (id: number) => {
    setChosenId(id);
    try {
      localStorage.setItem(STORAGE_KEY, String(id));
    } catch {
      // storage unavailable: the choice just is not remembered
    }
  };

  // forget a remembered event that no longer exists
  useEffect(() => {
    if (isAdmin && query.isSuccess && chosenId !== null && !events.some((e) => e.id === chosenId)) setChosenId(null);
  }, [isAdmin, query.isSuccess, chosenId, events]);

  return { events, event, choose, isAdmin, isPending: query.isPending, error: query.error };
}

export function EventPicker({ choice }: { choice: ReturnType<typeof useEventChoice> }) {
  if (choice.isPending) return <Loader size="sm" />;
  if (choice.error) return <Alert color="red">{choice.error.message}</Alert>;

  if (!choice.isAdmin) {
    return choice.event ? null : (
      <Alert color="yellow" title="Derzeit läuft keine Veranstaltung">
        Sobald der Administrator die Veranstaltung startet, geht es hier weiter.
      </Alert>
    );
  }

  if (choice.events.length === 0) {
    return <Alert color="yellow">Es gibt noch keine Veranstaltung. Sie wird unter „Veranstaltungen“ angelegt.</Alert>;
  }
  return (
    <>
      <Select
        label="Veranstaltung"
        maw={480}
        allowDeselect={false}
        data={choice.events.map((e) => ({
          value: String(e.id),
          label: `${e.name} (${formatDate(e.date)}) – ${STATUS_LABELS[e.status]}`,
        }))}
        value={choice.event ? String(choice.event.id) : null}
        onChange={(value) => value && choice.choose(Number(value))}
      />
      {choice.event && choice.event.status !== "OPEN" && (
        <Alert color="yellow">
          Diese Veranstaltung ist {STATUS_LABELS[choice.event.status]}. Die anderen Benutzer sehen sie nicht; als
          Administrator können Sie trotzdem Änderungen vornehmen.
        </Alert>
      )}
    </>
  );
}
