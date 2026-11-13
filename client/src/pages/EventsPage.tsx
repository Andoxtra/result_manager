import { Alert, Anchor, Badge, Button, Checkbox, Group, Loader, Menu, Modal, Stack, Switch, Table, Text, TextInput, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, type Discipline, type EventSummary } from "../api";
import { useAuth } from "../auth";
import { formatDate } from "../format";
import { notifyError, notifySuccess } from "../notify";

const today = () => new Date().toISOString().slice(0, 10);

function EventForm({ event, onDone }: { event: EventSummary | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(event?.name ?? "");
  const [date, setDate] = useState(event ? event.date.slice(0, 10) : today());
  const [selected, setSelected] = useState<string[]>(event?.disciplines.map((d) => String(d.id)) ?? []);

  const disciplines = useQuery({ queryKey: ["disciplines"], queryFn: () => api.get<Discipline[]>("/disciplines") });
  // inactive disciplines are only offered if the event already uses them
  const options = (disciplines.data ?? []).filter((d) => d.active || selected.includes(String(d.id)));

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), date, disciplineIds: selected.map(Number) };
      return event ? api.patch(`/events/${event.id}`, body) : api.post("/events", body);
    },
    onSuccess: () => {
      notifySuccess(event ? "Veranstaltung gespeichert." : "Veranstaltung angelegt.");
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["evaluation"] });
      onDone();
    },
    onError: notifyError,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <form onSubmit={submit}>
      <Stack>
        <TextInput label="Name" placeholder="z. B. Westernschießen 2024" value={name} onChange={(e) => setName(e.currentTarget.value)} maxLength={150} required data-autofocus />
        <TextInput label="Datum" type="date" value={date} onChange={(e) => setDate(e.currentTarget.value)} required />
        {disciplines.isPending ? (
          <Loader size="sm" />
        ) : (
          <Checkbox.Group label="Disziplinen" description="Welche Disziplinen werden geschossen?" value={selected} onChange={setSelected}>
            <Stack gap="xs" mt="xs">
              {options.map((d) => (
                <Checkbox key={d.id} value={String(d.id)} label={d.active ? d.name : `${d.name} (deaktiviert)`} />
              ))}
            </Stack>
          </Checkbox.Group>
        )}
        <Button type="submit" loading={save.isPending} disabled={!name.trim() || !date || selected.length === 0}>
          Speichern
        </Button>
      </Stack>
    </form>
  );
}

function DeleteForm({ event, onDone }: { event: EventSummary; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState("");
  const remove = useMutation({
    mutationFn: () => api.delete(`/events/${event.id}`),
    onSuccess: () => {
      notifySuccess("Veranstaltung gelöscht.");
      queryClient.invalidateQueries({ queryKey: ["events"] });
      onDone();
    },
    onError: notifyError,
  });

  return (
    <Stack>
      <Alert color="red">
        Die Veranstaltung wird mit allen {event.cardCount} Schießkarten, Schützen und Ergebnissen endgültig
        gelöscht. Das kann nicht rückgängig gemacht werden. Zum Aufbewahren stattdessen archivieren.
      </Alert>
      <TextInput
        label={`Zur Bestätigung den Namen eingeben: ${event.name}`}
        value={confirmation}
        onChange={(e) => setConfirmation(e.currentTarget.value)}
        autoComplete="off"
        data-autofocus
      />
      <Button color="red" loading={remove.isPending} disabled={confirmation.trim() !== event.name} onClick={() => remove.mutate()}>
        Endgültig löschen
      </Button>
    </Stack>
  );
}

export function EventsPage() {
  const { can } = useAuth();
  const isAdmin = can();
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<{ event: EventSummary | null } | null>(null);
  const [deleting, setDeleting] = useState<EventSummary | null>(null);

  const events = useQuery({
    queryKey: ["events", { archived: showArchived }],
    queryFn: () => api.get<EventSummary[]>(`/events${showArchived ? "?archived=true" : ""}`),
  });

  const update = useMutation({
    mutationFn: ({ event, body }: { event: EventSummary; body: object }) => api.patch(`/events/${event.id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["evaluation"] });
    },
    onError: notifyError,
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Veranstaltungen</Title>
        {isAdmin && <Button onClick={() => setForm({ event: null })}>Neue Veranstaltung</Button>}
      </Group>
      {isAdmin && (
        <Switch label="Archivierte anzeigen" checked={showArchived} onChange={(e) => setShowArchived(e.currentTarget.checked)} />
      )}

      {events.isPending && <Loader />}
      {events.error && <Alert color="red">{events.error.message}</Alert>}
      {events.data?.length === 0 && <Text c="dimmed">Es gibt noch keine Veranstaltung.</Text>}

      {!!events.data?.length && (
        <Table.ScrollContainer minWidth={640}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Datum</Table.Th>
                <Table.Th>Disziplinen</Table.Th>
                <Table.Th ta="right">Karten</Table.Th>
                <Table.Th>Status</Table.Th>
                {isAdmin && <Table.Th />}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {events.data.map((event) => (
                <Table.Tr key={event.id}>
                  <Table.Td>
                    <Anchor component={Link} to={`/veranstaltungen/${event.id}`}>
                      {event.name}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>{formatDate(event.date)}</Table.Td>
                  <Table.Td>{event.disciplines.map((d) => d.name).join(", ")}</Table.Td>
                  <Table.Td ta="right">{event.cardCount}</Table.Td>
                  <Table.Td>
                    <Group gap={6}>
                      <Badge color={event.status === "OPEN" ? "green" : "gray"}>
                        {event.status === "OPEN" ? "läuft" : "abgeschlossen"}
                      </Badge>
                      {event.archivedAt && <Badge color="orange">archiviert</Badge>}
                    </Group>
                  </Table.Td>
                  {isAdmin && (
                    <Table.Td ta="right">
                      <Menu position="bottom-end">
                        <Menu.Target>
                          <Button size="compact-sm" variant="default">
                            Verwalten
                          </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item onClick={() => setForm({ event })}>Bearbeiten</Menu.Item>
                          {event.status === "OPEN" ? (
                            <Menu.Item onClick={() => update.mutate({ event, body: { status: "CLOSED" } })}>Abschließen</Menu.Item>
                          ) : (
                            <Menu.Item onClick={() => update.mutate({ event, body: { status: "OPEN" } })}>Wieder öffnen</Menu.Item>
                          )}
                          {event.archivedAt ? (
                            <Menu.Item onClick={() => update.mutate({ event, body: { archived: false } })}>Archivierung aufheben</Menu.Item>
                          ) : (
                            <Menu.Item onClick={() => update.mutate({ event, body: { archived: true, status: "CLOSED" } })}>Archivieren</Menu.Item>
                          )}
                          <Menu.Divider />
                          <Menu.Item color="red" onClick={() => setDeleting(event)}>
                            Löschen …
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <Modal opened={!!form} onClose={() => setForm(null)} title={form?.event ? "Veranstaltung bearbeiten" : "Neue Veranstaltung"}>
        {form && <EventForm key={form.event?.id ?? "new"} event={form.event} onDone={() => setForm(null)} />}
      </Modal>
      <Modal opened={!!deleting} onClose={() => setDeleting(null)} title="Veranstaltung löschen">
        {deleting && <DeleteForm key={deleting.id} event={deleting} onDone={() => setDeleting(null)} />}
      </Modal>
    </Stack>
  );
}
