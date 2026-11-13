import { Alert, Loader, Select } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, type EventSummary } from "../api";
import { formatDate } from "../format";

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
 * The event a page works on. The choice is remembered per browser; without one the
 * most recent matching event is used.
 */
export function useEventChoice(filter: (event: EventSummary) => boolean) {
  const query = useQuery({
    queryKey: ["events"],
    queryFn: () => api.get<EventSummary[]>("/events"),
    refetchInterval: 30_000,
  });
  const [chosenId, setChosenId] = useState<number | null>(storedEventId);
  const events = (query.data ?? []).filter(filter);
  const event = events.find((e) => e.id === chosenId) ?? events[0] ?? null;

  useEffect(() => {
    if (!event) return;
    try {
      localStorage.setItem(STORAGE_KEY, String(event.id));
    } catch {
      // storage unavailable: the choice just is not remembered
    }
  }, [event?.id]);

  return { events, event, choose: setChosenId, isPending: query.isPending, error: query.error };
}

export function EventPicker({
  choice,
  emptyMessage,
}: {
  choice: ReturnType<typeof useEventChoice>;
  emptyMessage: string;
}) {
  if (choice.isPending) return <Loader size="sm" />;
  if (choice.error) return <Alert color="red">{choice.error.message}</Alert>;
  if (choice.events.length === 0) return <Alert color="yellow">{emptyMessage}</Alert>;
  return (
    <Select
      label="Veranstaltung"
      maw={420}
      allowDeselect={false}
      data={choice.events.map((e) => ({
        value: String(e.id),
        label: `${e.name} (${formatDate(e.date)})${e.status === "CLOSED" ? " – abgeschlossen" : ""}`,
      }))}
      value={choice.event ? String(choice.event.id) : null}
      onChange={(value) => value && choice.choose(Number(value))}
    />
  );
}
