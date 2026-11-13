import { Stack, Title } from "@mantine/core";
import { EventPicker, useEventChoice } from "../components/EventPicker";
import { EventResults } from "../components/EventResults";

export function EvaluationPage() {
  const choice = useEventChoice(() => true);
  return (
    <Stack>
      <Title order={2}>Auswertung</Title>
      <EventPicker choice={choice} emptyMessage="Es gibt noch keine Veranstaltung." />
      {choice.event && <EventResults key={choice.event.id} eventId={choice.event.id} />}
    </Stack>
  );
}
