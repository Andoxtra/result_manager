import { Alert, Anchor, Badge, Button, Group, Paper, SegmentedControl, Select, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, type Card, type Shooter } from "../api";
import { useAuth } from "../auth";
import { EventPicker, useEventChoice } from "../components/EventPicker";
import { cardResultText, isScored } from "../format";
import { notifyError, notifySuccess } from "../notify";

export function IssuePage() {
  const { can } = useAuth();
  const isAdmin = can();
  const choice = useEventChoice((e) => e.status === "OPEN" || isAdmin);
  const event = choice.event;
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState("");
  const [shooterId, setShooterId] = useState<string | null>(null);
  const [disciplineId, setDisciplineId] = useState<string | null>(null);
  const [lastCard, setLastCard] = useState<Card | null>(null);

  const shooters = useQuery({
    queryKey: ["shooters", event?.id],
    queryFn: () => api.get<Shooter[]>(`/events/${event!.id}/shooters`),
    enabled: !!event,
    refetchInterval: 10_000,
  });
  const cards = useQuery({
    queryKey: ["cards", event?.id],
    queryFn: () => api.get<Card[]>(`/events/${event!.id}/cards`),
    enabled: !!event,
    refetchInterval: 10_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["shooters", event?.id] });
    queryClient.invalidateQueries({ queryKey: ["cards", event?.id] });
    queryClient.invalidateQueries({ queryKey: ["events"] });
  };

  const issue = useMutation({
    mutationFn: (body: object) => api.post<Card>(`/events/${event!.id}/cards`, body),
    onSuccess: (card) => {
      setLastCard(card);
      setName("");
      setShooterId(null);
      refresh();
    },
    onError: notifyError,
  });

  const remove = useMutation({
    mutationFn: (card: Card) => api.delete(`/cards/${card.id}`),
    onSuccess: (_data, card) => {
      notifySuccess(`Karte ${card.cardNumber} wurde zurückgenommen.`);
      if (lastCard?.id === card.id) setLastCard(null);
      refresh();
    },
    onError: notifyError,
  });

  const disciplines = event?.disciplines ?? [];
  const selectedDiscipline = disciplines.some((d) => String(d.id) === disciplineId)
    ? disciplineId
    : disciplines.length === 1
      ? String(disciplines[0].id)
      : null;

  // someone asking for a second card is often entered as a new shooter by mistake
  const sameName =
    mode === "new" && name.trim()
      ? shooters.data?.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase())
      : undefined;

  const canSubmit = !!selectedDiscipline && (mode === "new" ? name.trim() !== "" : shooterId !== null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    issue.mutate({
      disciplineId: Number(selectedDiscipline),
      ...(mode === "new" ? { shooterName: name.trim() } : { shooterId: Number(shooterId) }),
    });
  }

  return (
    <Stack>
      <Title order={2}>Kartenausgabe</Title>
      <EventPicker choice={choice} emptyMessage="Es gibt derzeit keine laufende Veranstaltung." />

      {event && event.status === "CLOSED" && (
        <Alert color="yellow">Diese Veranstaltung ist abgeschlossen. Änderungen sind nur als Administrator möglich.</Alert>
      )}

      {event && (
        <Paper withBorder p="md" maw={560}>
          <form onSubmit={submit}>
            <Stack>
              <SegmentedControl
                value={mode}
                onChange={(value) => setMode(value as "new" | "existing")}
                data={[
                  { value: "new", label: "Neuer Schütze" },
                  { value: "existing", label: "Bereits registriert" },
                ]}
              />
              {mode === "new" ? (
                <TextInput
                  label="Name des Schützen"
                  description="Die Schützennummer wird automatisch vergeben."
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                  maxLength={100}
                  autoComplete="off"
                />
              ) : (
                <Select
                  label="Schütze"
                  placeholder="Nummer oder Name eingeben"
                  searchable
                  nothingFoundMessage="Kein Schütze gefunden"
                  data={(shooters.data ?? []).map((s) => ({ value: String(s.id), label: `Nr. ${s.number} – ${s.name}` }))}
                  value={shooterId}
                  onChange={setShooterId}
                />
              )}
              {sameName && (
                <Alert color="yellow">
                  Es gibt bereits einen Schützen mit diesem Namen (Nr. {sameName.number}).{" "}
                  <Anchor
                    component="button"
                    type="button"
                    onClick={() => {
                      setMode("existing");
                      setShooterId(String(sameName.id));
                    }}
                  >
                    Diesen Schützen verwenden
                  </Anchor>
                </Alert>
              )}
              <Select
                label="Disziplin"
                placeholder="Disziplin wählen"
                data={disciplines.map((d) => ({ value: String(d.id), label: d.name }))}
                value={selectedDiscipline}
                onChange={setDisciplineId}
                allowDeselect={false}
              />
              <Button type="submit" loading={issue.isPending} disabled={!canSubmit}>
                Schießkarte ausgeben
              </Button>
            </Stack>
          </form>
        </Paper>
      )}

      {lastCard && lastCard.eventId === event?.id && (
        <Alert color="green" title="Schießkarte ausgegeben – bitte auf die Karte schreiben" maw={560}>
          <Group gap="xl">
            <div>
              <Text size="sm" c="dimmed">Karte</Text>
              <Text fw={700} size="xl">{lastCard.cardNumber}</Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">Schützennummer</Text>
              <Text fw={700} size="xl">{lastCard.shooter.number}</Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">Name</Text>
              <Text fw={700} size="xl">{lastCard.shooter.name}</Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">Disziplin</Text>
              <Text fw={700} size="xl">{lastCard.discipline.name}</Text>
            </div>
          </Group>
        </Alert>
      )}

      {event && (
        <>
          <Title order={4} mt="md">
            Ausgegebene Karten ({cards.data?.length ?? 0})
          </Title>
          {cards.error && <Alert color="red">{cards.error.message}</Alert>}
          <Table.ScrollContainer minWidth={560}>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Karte</Table.Th>
                  <Table.Th>Nr.</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Disziplin</Table.Th>
                  <Table.Th>Ergebnis</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(cards.data ?? []).map((card) => (
                  <Table.Tr key={card.id}>
                    <Table.Td>{card.cardNumber}</Table.Td>
                    <Table.Td>{card.shooter.number}</Table.Td>
                    <Table.Td>{card.shooter.name}</Table.Td>
                    <Table.Td>{card.discipline.name}</Table.Td>
                    <Table.Td>{isScored(card) ? cardResultText(card) : <Badge color="gray" variant="light">offen</Badge>}</Table.Td>
                    <Table.Td ta="right">
                      {(!isScored(card) || isAdmin) && (
                        <Button
                          size="compact-sm"
                          variant="subtle"
                          color="red"
                          onClick={() => {
                            const warning = isScored(card) ? " Das erfasste Ergebnis geht dabei verloren." : "";
                            if (window.confirm(`Karte ${card.cardNumber} von ${card.shooter.name} wirklich zurücknehmen?${warning}`)) {
                              remove.mutate(card);
                            }
                          }}
                        >
                          Zurücknehmen
                        </Button>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </>
      )}
    </Stack>
  );
}
