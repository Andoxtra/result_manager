import { Anchor, Stack } from "@mantine/core";
import { Link, useParams } from "react-router-dom";
import { EventResults } from "../components/EventResults";

export function EventDetailPage() {
  const id = Number(useParams().id);
  return (
    <Stack>
      <Anchor component={Link} to="/veranstaltungen">
        ← Alle Veranstaltungen
      </Anchor>
      {Number.isInteger(id) && id > 0 && <EventResults key={id} eventId={id} />}
    </Stack>
  );
}
